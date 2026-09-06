// Resolves a logo host for every company in the all-tech universe so the feed
// can render a favicon logo for each row instead of falling back to the
// monogram. For each company we try, in order:
//   1. its known domain,
//   2. the origin host of its careers_url (when it is a real company site),
//   3. its ATS board subdomain (greenhouse/ashby host a per-company favicon),
//   4. a DNS probe of <slug>.com/.io/.ai/.co/.org.
// The result is written to the new all_companies.logo_host column, which
// /api/jobs-all uses to build `https://www.google.com/s2/favicons?domain=...`.
//
//   node scripts/resolve-domains.mjs
process.env.UV_THREADPOOL_SIZE = "256";
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = resolve(ROOT, ".env.local");
function loadEnv() {
  for (const raw of readFileSync(ENV, "utf8").split("\n")) {
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

// aggregator/ATS hosts whose favicon would be generic, never a company logo
const GENERIC_HOSTS = new Set([
  "boards.greenhouse.io", "job-boards.greenhouse.io", "boards-api.greenhouse.io",
  "jobs.ashbyhq.com", "job-boards.ashbyhq.com", "api.ashbyhq.com",
  "jobs.lever.co", "api.lever.co",
  "jobs.smartrecruiters.com", "api.smartrecruiters.com",
  "apply.workable.com", "jobs.jobvite.com", "sjobs.brassring.com",
  "ats.rippling.com", "recruiting.ultipro.com", "career4.successfactors.com",
  "careers.smartrecruiters.com", "jobs.hr-manager.net", "jobs-nl.hr-manager.net",
  "jobs.crew.co", "boards.jobspread.com", "jobs.gecko.hr", "jobs.oura.com",
  "careers.walmart.com", "workforcenow.adp.com", "onecareer.info",
  "www.myworkdayjobs.com", "myworkdayjobs.com", "icims.com",
  "womenintechuk.com", "www.linkedin.com", "linkedin.com",
]);

const slugHost = (name) =>
  name.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "")
    .replace(/^(the|and)/, "");

function careersHost(raw) {
  if (!raw) return null;
  let s = raw.trim();
  if (/^https?:\/\//.test(s)) s = s.replace(/^https?:\/\//, "").split("/")[0];
  else s = s.split("/")[0];
  s = s.toLowerCase().replace(/^www\./, "");
  if (!s.includes(".")) return null;
  return s;
}

const boardHost = (type, token) => {
  if (!token) return null;
  const t = String(token).toLowerCase().replace(/[^a-z0-9.-]/g, "");
  if (type === "greenhouse") return `${t}.greenhouse.io`;
  if (type === "ashby") return `${t}.ashbyhq.com`;
  if (type === "nvidia") return "nvidia.com";
  if (type === "amazon") return t === "amazonaws" ? "amazonaws.com" : "amazon.com";
  return null;
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });

/* ---------------- candidate resolution ---------------- */

const TLDS = ["com", "io", "ai", "co", "org"];
const seen = new Set();
const cached = new Map(); // hostname -> boolean (resolves)
function dnsCached(host) {
  if (cached.has(host)) return cached.get(host);
  seen.add(host);
  return undefined; // not yet known
}

async function probeDns(host) {
  if (cached.has(host)) return cached.get(host);
  try {
    await Promise.race([
      lookup(host, { family: 4 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("dns slow")), 1200)),
    ]);
    cached.set(host, true);
    return true;
  } catch {
    cached.set(host, false);
    return false;
  }
}

async function pickDomain(name, careersHostValue) {
  if (careersHostValue) return careersHostValue; // real company site
  const slug = slugHost(name);
  if (!slug) return null;
  for (const tld of TLDS) {
    const host = `${slug}.${tld}`;
    if (host.length > 63) continue;
    if (dnsCached(host) === true) return host;
  }
  return null;
}

async function main() {
  const reg = JSON.parse(readFileSync(resolve(ROOT, "lib/companies-all.json"), "utf8"));
  await pool.query(`ALTER TABLE all_companies ADD COLUMN IF NOT EXISTS logo_host TEXT`);

  const { rows } = await pool.query("SELECT id, name, domain, careers_url, ats_type, ats_token FROM all_companies ORDER BY id");
  console.log("companies:", rows.length);

  const employers = rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      domain: r.domain || null,
      careers: careersHost(r.careers_url),
      ats: r.ats_type || null,
      token: r.ats_token || null,
    }))
    .filter((c) => !c.domain); // ones we still need a logo host for

  console.log("need logo host:", employers.length);

  // Pre-classify: careers_url host is a real company site?
  const viaCareers = [];
  const rest = [];
  for (const c of employers) {
    if (c.careers && !GENERIC_HOSTS.has(c.careers) && c.careers !== boardHost(c.ats, c.token)) {
      viaCareers.push({ ...c, host: c.careers });
    } else {
      rest.push(c);
    }
  }
  console.log("via careers_url host:", viaCareers.length);

  // ATS board subdomains (validated only that token looks sane)
  const atsBoard = [];
  const needsDns = [];
  for (const c of rest) {
    const bh = boardHost(c.ats, c.token);
    if (bh && c.ats !== "amazon" && c.ats !== "nvidia") atsBoard.push({ ...c, host: bh });
    else needsDns.push(c);
  }
  console.log("via ATS board subdomain:", atsBoard.length);
  console.log("needs DNS probe:", needsDns.length);

  // Resolve DNS candidates: <slug>.com has the highest hit rate and probes
// quickly (negative answers are cached/fast); rarer TLDs trigger multi-second
// resolver stalls in this environment, so we skip them and let the frontend's
// monogram fallback handle the remainder.
  const dnsCompanies = [...needsDns];
  async function probeMany(hosts) {
    const todo = [...new Set(hosts)];
    let di = 0;
    const worker = async () => {
      for (;;) {
        const i = di++;
        if (i >= todo.length) return;
        const host = todo[i];
        if (cached.has(host)) continue;
        try {
          await Promise.race([
            lookup(host, { family: 4 }),
            new Promise((_, rej) => setTimeout(() => rej(new Error("dns slow")), 900)),
          ]);
          cached.set(host, true);
        } catch {
          cached.set(host, false);
        }
      }
    };
    await Promise.all(Array.from({ length: 96 }, worker));
  }

  const phase1Hosts = dnsCompanies
    .map((c) => `${slugHost(c.name)}.com`)
    .filter((h) => h.length <= 63)
    .filter((h) => !["boards.greenhouse.io", "jobs.ashbyhq.com", "jobs.lever.co", "jobs.smartrecruiters.com", "www.amazon.jobs"].includes(h));
  console.log("dns .com hosts:", phase1Hosts.length);
  await probeMany(phase1Hosts);
  console.log("dns .com done");

  const found = new Set();
  for (const c of dnsCompanies) {
    const host = `${slugHost(c.name)}.com`;
    if (host.length <= 63 && cached.get(host) === true) found.add(c.id);
  }
  const missing = dnsCompanies.filter((c) => !found.has(c.id));
  if (missing.length) {
    await pool.query("UPDATE all_companies SET last_error = 'no domain resolved' WHERE id = ANY($1)", [missing.map((c) => c.id)]);
  }

  // Assign best host per company.
  const updates = [];
  const seenById = new Set();
  for (const c of viaCareers) {
    updates.push([c.id, c.host]);
    seenById.add(c.id);
  }
  for (const c of atsBoard) {
    if (seenById.has(c.id)) continue;
    updates.push([c.id, c.host]);
    seenById.add(c.id);
  }
  for (const c of needsDns) {
    if (seenById.has(c.id)) continue;
    const host = await pickDomain(c.name, null);
    if (host) { updates.push([c.id, host]); seenById.add(c.id); }
  }
  console.log("dns matches:", seenById.size, "| total updates:", updates.length);

  // Companies already having a domain
  const withDomain = rows.filter((r) => r.domain);
  for (const r of withDomain) updates.push([r.id, r.domain]);

  // Batch-write updates instead of one round-trip per company.
  const CHUNK = 1500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const values = chunk
      .map((_, k) => `($${k * 2 + 1}, $${k * 2 + 2})`)
      .join(",");
    const params = chunk.flatMap(([id, host]) => [id, host]);
    await pool.query(
      `UPDATE all_companies ac SET logo_host = v.logo
       FROM (VALUES ${values}) AS v(id, logo)
       WHERE ac.id = v.id::int AND ac.logo_host IS DISTINCT FROM v.logo`,
      params
    );
  }
  await pool.query("UPDATE all_companies SET last_error = NULL WHERE logo_host IS NOT NULL");
  const covered = (await pool.query("SELECT COUNT(*)::int AS n FROM all_companies WHERE logo_host IS NOT NULL")).rows[0].n;
  const total = (await pool.query("SELECT COUNT(*)::int AS n FROM all_companies")).rows[0].n;
  console.log("updated:", updates.length, "| covered:", covered, "of", total, "=", Math.round((covered / total) * 100) + "%");

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});