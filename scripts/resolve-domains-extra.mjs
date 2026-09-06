// Supplemental DoH pass for companies still missing a logo_host: try more TLDs
// (gov/mil/edu + European/APAC ccTLDs + startup-friendly TLDs), plus a few
// brand->domain rules that don't follow the slug pattern.
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
  for (const raw of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    try { const u = new URL(v); u.searchParams.delete("channel_binding"); process.env[k] = u.toString(); }
    catch { process.env[k] = v; }
  }
}
loadEnv();

const EXTRA_TLDS = ["de", "uk", "gov", "mil", "edu", "ac.uk", "fr", "nl", "au", "eu", "ch", "se", "it", "es", "jp", "sg", "il", "be", "at", "pl", "in", "kr", "dk", "fi", "no", "xyz", "me", "gg", "one", "global", "pro", "io", "ai", "ca"];
const EXTRA_OVERRIDES = {
  "Lawrence Livermore National Laboratory (LLNL)": "llnl.gov",
  "General Atomics": "ga.com",
};

const slugHost = (name) => name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "").replace(/^(the|and)/, "");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });

async function probeDoh(host) {
  try {
    const r = await fetch("https://cloudflare-dns.com/dns-query?name=" + host + "&type=A", { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return j.Status === 0 && Array.isArray(j.Answer) && j.Answer.some((a) => a.type === 1 || a.type === 5);
  } catch { return false; }
}

async function firstResolving(slug) {
  if (!slug) return null;
  for (const tld of EXTRA_TLDS) {
    const host = slug + "." + tld;
    if (host.length > 63) continue;
    if (await probeDoh(host)) return host;
  }
  return null;
}

(async () => {
  const { rows } = await pool.query("SELECT id, name, ats_token FROM all_companies WHERE logo_host IS NULL ORDER BY id");
  console.log("still missing:", rows.length);

  const slugOf = new Map();
  for (const r of rows) {
    const tokenSlug = (r.ats_token || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const nameSlug = slugHost(r.name);
    if (tokenSlug.length >= 3 && tokenSlug.length <= 40) slugOf.set(tokenSlug, r.id);
    if (nameSlug.length >= 3 && nameSlug.length <= 40) slugOf.set(nameSlug, r.id);
  }
  const slugs = [...slugOf.keys()];
  console.log("unique slugs:", slugs.length);

  let hits = 0;
  const matchOf = new Map();
  const BATCH = 30;
  for (let i = 0; i < slugs.length; i += BATCH) {
    const chunk = slugs.slice(i, i + BATCH);
    const res = await Promise.all(chunk.map((s) => firstResolving(s)));
    res.forEach((h, k) => { if (h) { matchOf.set(chunk[k], h); hits++; } });
    process.stdout.write(`\r  ${Math.min(i + BATCH, slugs.length)}/${slugs.length} hits=${hits}`);
  }
  process.stdout.write("\n");

  const updates = [];
  const seen = new Set();
  for (const r of rows) {
    if (EXTRA_OVERRIDES[r.name]) { updates.push([r.id, EXTRA_OVERRIDES[r.name]]); seen.add(r.id); continue; }
    const tokenSlug = (r.ats_token || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const nameSlug = slugHost(r.name);
    let host = tokenSlug.length >= 3 ? matchOf.get(tokenSlug) : null;
    if (!host) host = nameSlug.length >= 3 ? matchOf.get(nameSlug) : null;
    if (host && !seen.has(r.id)) {
      updates.push([r.id, host]);
      seen.add(r.id);
    }
  }
  console.log("new hits this pass:", updates.length);

  const CHUNK = 1500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const values = chunk.map((_, k) => `($${k * 2 + 1}, $${k * 2 + 2})`).join(",");
    const params = chunk.flatMap(([id, h]) => [id, h]);
    await pool.query(`UPDATE all_companies ac SET logo_host = v.logo, last_error = NULL FROM (VALUES ${values}) AS v(id, logo) WHERE ac.id = v.id::int AND ac.logo_host IS DISTINCT FROM v.logo`, params);
  }

  const covered = (await pool.query("SELECT COUNT(*)::int n FROM all_companies WHERE logo_host IS NOT NULL")).rows[0].n;
  const total = (await pool.query("SELECT COUNT(*)::int n FROM all_companies")).rows[0].n;
  console.log("covered:", covered, "of", total, "=", Math.round((covered / total) * 100) + "%");
  const feedMissing = await pool.query(`SELECT DISTINCT ac.name FROM all_jobs aj JOIN all_companies ac ON ac.id=aj.company_id WHERE aj.active AND ac.logo_host IS NULL ORDER BY ac.name`);
  console.log("feed companies still missing logo:", feedMissing.rows.length);
  for (const r of feedMissing.rows) console.log("  -", r.name);
  await pool.end();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });