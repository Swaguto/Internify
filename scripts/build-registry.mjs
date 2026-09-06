// Builds lib/companies-all.json — a 2000+ company tech/robotics/quant/internship
// universe sourced from the SimplifyJobs/Pitt CSC internship archives, merged
// with the curated Internify registry and a manual extras list.
//
//   node scripts/build-registry.mjs         (fetch + parse + DNS-check + write)
//   node scripts/build-registry.mjs --skip-net  (use already-fetched /tmp lists, skip DNS)
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "lib/companies-all.json");
const TMP = "/tmp/opencode/lists";
const skipNet = process.argv.includes("--skip-net");

/* ---------------- fetching ---------------- */

const SOURCES = [
  ["README.md", "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README.md", "html"],
  ["README-Off-Season.md", "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README-Off-Season.md", "html"],
  ["README-Inactive.md", "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README-Inactive.md", "md"],
];
for (const y of [2021, 2022, 2023, 2024, 2025, 2026]) {
  SOURCES.push([
    `readme-archived-${y}.md`,
    `https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/archived/README-${y}.md`,
    y <= 2023 ? "legacy" : y === 2026 ? "html" : "md",
  ]);
}

if (!skipNet) {
  mkdirSync(TMP, { recursive: true });
  for (const [file, url] of SOURCES) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(resolve(TMP, file), await res.text());
      console.log("fetched", file);
    } catch (e) {
      console.log("FAILED", file, String(e.message || e));
    }
  }
}

/* ---------------- parsing ---------------- */

const rows = []; // {name, role, loc, applyUrl}
function clean(s) {
  s = (s || "").replace(/<[^>]+>/g, "");
  try { s = decodeURIComponent(s); } catch { /* keep as-is */ }
  return s.replace(/\s+/g, " ").trim();
}

function parseHtml(file) {
  const txt = readFileSync(resolve(TMP, file), "utf8");
  let cur = null;
  for (const r of txt.matchAll(/<tr>(.*?)<\/tr>/gs)) {
    const row = r[1];
    const a = row.match(/<a href="https:\/\/simplify\.jobs\/c\/[^">]*"[^>]*>([^<]+)<\/a>/);
    if (a) cur = clean(a[1]);
    const tds = row.split("<td>").slice(1).map((t) => t.split("</td>")[0]);
    if (tds.length < 2 || !cur) continue;
    const m = row.match(/<a href="(https:\/\/[^"]+)"[^>]*><img[^>]*alt="Apply"/);
    rows.push({ name: cur, role: clean(tds[1]), loc: clean(tds[2] || ""), applyUrl: m ? m[1] : "" });
  }
}

function parseMd(file) {
  const txt = readFileSync(resolve(TMP, file), "utf8");
  let cur = null;
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\s*\|/, "").split("|").map((c) => c.trim());
    if (cells.length < 3) continue;
    const m = cells[0].match(/\[([^\]|]+)\]\([^)]*\)/);
    if (m) {
      const name = clean(m[1]);
      if (!name || name.toLowerCase() === "company") { cur = null; continue; }
      if (!cells[0].includes("↳")) cur = name;
    }
    if (!cur) continue;
    let applyUrl = "";
    for (const c of cells) {
      const link = c.match(/\[Apply\]\(([^)]+)\)/);
      if (link) { applyUrl = link[1]; break; }
    }
    rows.push({ name: cur, role: clean(cells[1] || ""), loc: clean(cells[2] || ""), applyUrl });
  }
}

function parseLegacy(file) {
  const txt = readFileSync(resolve(TMP, file), "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\|?\s*\[([^\]|]+)\]\(([^)]*)\)\s*\|/);
    if (!m) continue;
    const name = clean(m[1]);
    if (!name || name.toLowerCase() === "name") continue;
    rows.push({ name, role: "", loc: "", applyUrl: m[2] });
  }
}

for (const [file, , fmt] of SOURCES) {
  const p = resolve(TMP, file);
  if (!existsSync(p)) continue;
  if (fmt === "html") parseHtml(file);
  else if (fmt === "md") parseMd(file);
  else parseLegacy(file);
}

/* ---------------- ATS inference ---------------- */

function atsOf(url) {
  if (!url) return null;
  for (const pat of [
    /boards(?:\.eu)?\.greenhouse\.io\/((?:(?!jobs[/?#])[A-Za-z0-9._-])+)\/jobs/,
    /job-boards\.greenhouse\.io\/((?:(?!jobs[/?#])[A-Za-z0-9._-])+)\/jobs/,
    /boards-api\.greenhouse\.io\/v1\/boards\/([^/?#]+)/,
  ]) {
    const m = url.match(pat);
    if (m) return { type: "greenhouse", token: m[1].toLowerCase() };
  }
  for (const pat of [/job-boards\.ashbyhq\.com\/([^/?#]+)/, /jobs\.ashbyhq\.com\/([^/?#]+)/]) {
    const m = url.match(pat);
    if (m) return { type: "ashby", token: clean(m[1]).replace(/-$/g, "") };
  }
  const lev = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (lev) return { type: "lever", token: lev[1].toLowerCase() };
  const sr = url.match(/jobs\.smartrecruiters\.com\/([^/?#]+)/);
  if (sr) return { type: "smartrecruiters", token: sr[1] };
  if (url.includes("amazon.jobs")) return { type: "amazon", token: "amazon" };
  return null;
}

const PRIORITY = { greenhouse: 0, ashby: 1, lever: 2, smartrecruiters: 3, amazon: 4, workday: 5, generic: 6 };

const bestAts = new Map(); // name -> ats
const careersUrl = new Map(); // name -> best careers URL
for (const r of rows) {
  const a = atsOf(r.applyUrl);
  if (a) {
    const prev = bestAts.get(r.name);
    if (!prev || (PRIORITY[a.type] ?? 9) < (PRIORITY[prev.type] ?? 9)) {
      bestAts.set(r.name, a);
    }
  }
  const u = r.applyUrl.replace(/\?.*$/, "");
  if (u && /^https?:\/\//.test(u) && !careersUrl.has(r.name) && !/(simplify\.jobs|i\.imgur|linkedin\.com|handshake|wayup)/.test(u)) {
    try {
      careersUrl.set(r.name, new URL(u).origin.replace(/^https?:\/\//, ""));
    } catch { /* skip */ }
  }
}

/* ---------------- curated + extras ---------------- */

const curated = [];
if (existsSync(resolve(ROOT, "lib/companies.json"))) {
  const reg = JSON.parse(readFileSync(resolve(ROOT, "lib/companies.json"), "utf8"));
  for (const c of reg.companies || []) {
    curated.push({ name: c.name, domain: c.domain, careersUrl: c.careersUrl, ats: c.ats?.type ? { type: c.ats.type, token: c.ats.token || c.ats.slug } : null, source: "internify" });
    bestAts.delete(c.name); // curated wins
  }
}

// High-paying Canadian firms + robotics/AI names worth tracking explicitly.
const EXTRAS = [
  ["Shopify"], ["Wealthsimple"], ["Constellation Software"], ["OpenText"], ["Docebo"], ["Kinaxis"],
  ["Coveo"], ["Lightspeed"], ["PointClickCare"], ["Klue"], ["Hootsuite"], ["BlackBerry"],
  ["7shifts"], ["Ada"], ["Borrowell"], ["KOHO"], ["AMD"], ["Qualcomm"], ["Intel"],
  ["Mastercard"], ["Visa"], ["RBC"], ["TD Bank"], ["BMO"], ["CIBC"], ["Scotiabank"],
  ["Manulife"], ["Sun Life"], ["Bell Canada"], ["Rogers"], ["Telus"], ["CGI Group"],
  ["Interac"], ["Geotab"], ["Avidbots"], ["Clearpath Robotics"], ["Sanctuary AI"], ["MDA Space"],
  ["Bombardier"], ["Siemens Canada"], ["Honeywell Canada"], ["GM Canada"], ["Ford Canada"],
  ["Zoox"], ["Gatik"], ["Einride"], ["Applied Intuition"], ["Aurora Innovation"], ["Cruise"],
  ["Vector Institute"], ["Mila"], ["Cohere"], ["Anthropic"], ["xAI"], ["Perplexity AI"],
  ["Character AI"], ["Mistral AI"], ["SpaceX"], ["Blue Origin"], ["Rocket Lab"],
  ["Northrop Grumman"], ["Lockheed Martin"], ["BAE Systems"], ["L3Harris"], ["General Atomics"],
  ["Palantir"], ["Epic Games"], ["Ubisoft Canada"], ["Sony Interactive Entertainment"],
  ["Nintendo"], ["Unity"], ["Roblox"], ["Cloudflare"], ["Datadog"], ["Snowflake"],
  ["Databricks"], ["Stripe"], ["Plaid"], ["Brex"], ["Ramp"], ["Deel"], ["Gusto"],
  ["Rippling"], ["Vanta"], ["Grafana Labs"], ["HashiCorp"], ["GitLab"], ["Atlassian"],
  ["Monday.com"], ["Wiz"], ["SentinelOne"], ["CrowdStrike"], ["Palo Alto Networks"],
  ["Fortinet"], ["Okta"], ["Twilio"], ["Braze"], ["Amplitude"], ["Segment"],
  ["Adyen"], ["Klarna"], ["Affirm"], ["SoFi"], ["Chime"], ["Robinhood"],
  ["Coinbase"], ["Kraken"], ["Chainalysis"], ["Fireblocks"], ["Alchemy"],
  ["Mysten Labs"], ["Aptos"], ["Consensys"], ["Sui Foundation"],
  ["Optiver"], ["SIG"], ["DRW"], ["Virtu Financial"], ["Two Sigma"], ["Citadel Securities"],
  ["Radix Trading"], ["Maven Securities"], ["Old Mission"], ["Da Vinci Derivatives"],
  ["Voleon"], ["Belvedere Trading"], ["TransMarket Group"], ["Sakana AI"], ["ElevenLabs"],
  ["AssemblyAI"], ["Hugging Face"], ["Replicate"], ["Runway"], ["Pika Labs"], ["Midjourney"],
  ["Stability AI"], ["Lightning AI"], ["Weights & Biases"], ["Modal"], ["Fireworks AI"],
  ["Together AI"], ["Groq"], ["Cerebras"], ["SambaNova"], ["Tenstorrent"],
  ["Celonis"], ["Samsara"], ["Unitree"], ["Fourier Intelligence"], ["Boston Dynamics"],
  ["1X Technologies"], ["Figure AI"], ["Agility Robotics"], ["ANYbotics"],
] ;

const pushedExtras = new Set();
for (const [name] of EXTRAS) {
  if (bestAts.has(name) || curated.some((c) => c.name === name) || pushedExtras.has(name)) continue;
  pushedExtras.add(name);
  curated.push({ name, ats: null, source: "extra" });
}

/* ---------------- merge + DNS ---------------- */

const merged = new Map();
for (const c of curated) merged.set(c.name, c);
const allNames = new Set();
for (const r of rows) allNames.add(r.name);
for (const name of allNames) {
  if (merged.has(name)) continue;
  merged.set(name, {
    name,
    careersUrl: careersUrl.get(name),
    ats: bestAts.get(name) || null,
    source: "simplify",
  });
}

function slugHost(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "")
    .replace(/^(the|and)/, "");
}

const CON = Math.min(64, 64);
let idx = 0;
async function resolveDomains(list) {
  const results = new Array(list.length);
  const worker = async () => {
    for (;;) {
      const i = idx++;
      if (i >= list.length) return;
      const c = list[i];
      if (c.domain) { results[i] = c.domain; continue; }
      const host = `${slugHost(c.name)}.com`;
      if (host.length > 63) { results[i] = null; continue; }
      try {
        await Promise.race([
          lookup(host, { all: true }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1200)),
        ]);
        results[i] = host;
      } catch {
        results[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: CON }, worker));
  return results;
}

const all = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
const domains = skipNet ? all.map(() => null) : await resolveDomains(all);
for (let i = 0; i < all.length; i++) all[i].domain = all[i].domain || domains[i];

const byAts = (t) => all.filter((c) => c.ats?.type === t).length;
console.log("unique companies:", all.length);
console.log("scrapable ATS:", { greenhouse: byAts("greenhouse"), ashby: byAts("ashby"), lever: byAts("lever"), smartrecruiters: byAts("smartrecruiters"), amazon: byAts("amazon") });
console.log("no ATS (name-discovery/track):", all.filter((c) => !c.ats).length);
console.log("with domain:", all.filter((c) => !!c.domain).length);

writeFileSync(OUT, JSON.stringify({ version: 1, source: "SimplifyJobs+Pitt CSC archive · Internify curated · extras", total: all.length, companies: all }, null, 2));
console.log("wrote", OUT);