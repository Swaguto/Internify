// Adds the "Silicon, Accelerators, AI Hardware, GPU Cloud, Inference,
// Compilers, Data/Vector, Observability, Robotics & Frontier Infra" companies
// to the all-tech universe. Only inserts names that don't yet exist, with their
// known ATS config + logo site where available; the rest get logo-host resolved
// via DNS probe later.
//
//   node scripts/seed-infra-companies.mjs
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
  for (const raw of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    try { const u = new URL(v); u.searchParams.delete("channel_binding"); process.env[k] = u.toString(); }
    catch { process.env[k] = v; }
  }
}
loadEnv();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 8 });

// name -> { ats, token, logo }   (logo = real careers/company site)
const INFRA = [
  // ---- Silicon / accelerators / AI hardware ----
  ["Cerebras Systems", { ats: "ashby", token: "cerebras", logo: "cerebras.net" }],
  ["d-Matrix", { ats: "greenhouse", token: "dmatrix", logo: "d-matrix.ai" }],
  ["Ayar Labs", { logo: "ayarlabs.com" }],
  ["Celestial AI", { ats: "greenhouse", token: "celestialai", logo: "celestial.ai" }],
  ["SiMa.ai", { ats: "greenhouse", token: "simaai", logo: "sima.ai" }],
  ["Untether AI", { logo: "untether.ai" }],
  ["Taalas", { logo: "taalas.ai" }],
  ["Enfabrica", { ats: "ashby", token: "enfabrica", logo: "enfabrica.com" }],
  ["Mythic", { ats: "greenhouse", token: "mythic", logo: "mythic.ai" }],
  ["Axelera AI", { logo: "axelera.ai" }],
  // ---- GPU cloud / neocloud ----
  ["CoreWeave", { logo: "coreweave.com" }],
  ["Crusoe", { ats: "greenhouse", token: "crusoe", logo: "crusoeenergy.com" }],
  ["Nscale", { logo: "nscale.com" }],
  ["Nebius", { ats: "lever", token: "nebius", logo: "nebius.com" }],
  ["RunPod", { ats: "ashby", token: "runpod", logo: "runpod.io" }],
  ["TensorDock", { logo: "tensordock.com" }],
  ["Prime Intellect", { ats: "ashby", token: "primeintellect", logo: "primeintellect.ai" }],
  ["Voltage Park", { logo: "voltagepark.com" }],
  ["SF Compute", { logo: "sfcompute.com" }],
  ["DataCrunch.io", { logo: "datacrunch.io" }],
  ["Spheron", { logo: "spheron.network" }],
  ["Fluidstack", { logo: "fluidstack.io" }],
  ["Shadeform", { logo: "shadeform.ai" }],
  // ---- Inference / serving ----
  ["Baseten", { ats: "ashby", token: "baseten", logo: "baseten.co" }],
  ["Lepton AI", { ats: "greenhouse", token: "leptonai", logo: "lepton.ai" }],
  ["DeepInfra", { logo: "deepinfra.com" }],
  ["Inworld AI", { ats: "greenhouse", token: "inworld", logo: "inworld.ai" }],
  ["fal.ai", { ats: "ashby", token: "fal-ai", logo: "fal.ai" }],
  ["Koyeb", { logo: "koyeb.com" }],
  ["Northflank", { logo: "northflank.com" }],
  ["OctoML", { logo: "octoml.ai" }],
  ["Deci AI", { logo: "deci.ai" }],
  ["Blaize", { ats: "greenhouse", token: "blaize", logo: "blaize.com" }],
  // ---- compilers / kernels / perf ----
  ["Unsloth AI", { logo: "unsloth.ai" }],
  ["Luminal", { logo: "modular.com" }],
  ["RiftStack", { logo: "riftstack.com" }],
  ["CentML", { ats: "lever", token: "centml", logo: "centml.ai" }],
  ["Cumulus Labs", { logo: "cumuluslabs.ai" }],
  ["DeepX", { logo: "deepx.com" }],
  // ---- cluster orchestration / training ----
  ["Anyscale", { ats: "greenhouse", token: "anyscale", logo: "anyscale.com" }],
  ["dstack", { logo: "dstack.ai" }],
  ["Trainy", { logo: "trainy.ai" }],
  ["dbt Labs", { logo: "getdbt.com" }],
  ["Vast Data", { ats: "greenhouse", token: "vastdata", logo: "vastdata.com" }],
  ["Runhouse", { logo: "runhouse.ai" }],
  // ---- data engine / vector ----
  ["Vectara", { ats: "greenhouse", token: "vectara", logo: "vectara.com" }],
  ["Unstructured", { logo: "unstructured.io" }],
  ["SurrealDB", { logo: "surrealdb.com" }],
  ["Milvus", { logo: "milvus.io" }],
  ["Zilliz", { logo: "zilliz.com" }],
  ["Qdrant", { ats: "lever", token: "qdrant", logo: "qdrant.tech" }],
  ["Weaviate", { logo: "weaviate.io" }],
  ["Chroma", { logo: "trychroma.com" }],
  // ---- observability / eval / guardrails ----
  ["LangChain", { ats: "greenhouse", token: "langchain", logo: "langchain.com" }],
  ["LangSmith", { logo: "langchain.com" }],
  ["Langfuse", { logo: "langfuse.com" }],
  ["Arize AI", { ats: "greenhouse", token: "arize", logo: "arize.com" }],
  ["Braintrust", { logo: "braintrust.dev" }],
  ["Galileo", { ats: "ashby", token: "galileo", logo: "rungalileo.io" }],
  ["Helicone", { logo: "helicone.ai" }],
  ["Phoenix", { logo: "auth0.com" }],
  ["LMArena", { logo: "lmarena.ai" }],
  ["LMSYS", { logo: "lmarena.ai" }],
  ["Credo AI", { logo: "credo.ai" }],
  ["CalypsoAI", { logo: "calypsoai.com" }],
  ["Noma Security", { logo: "noma.security" }],
  // ---- robotics / embodied ----
  ["Genesis", { logo: "genesis-world.readthedocs.io" }],
  ["Standard Bots", { ats: "greenhouse", token: "standardbots", logo: "standardbots.com" }],
  ["Freedom Robotics", { logo: "freedomrobotics.ai" }],
  ["Gracia", { logo: "gracia.ai" }],
];

const slugHost = (name) => name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "").replace(/^(the|and)/, "");

async function dnsOk(host) {
  try {
    await Promise.race([lookup(host, { family: 4 }), new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 900))]);
    return true;
  } catch { return false; }
}

// Probe each company's ATS board to confirm/discover the config.
async function probeAts(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const GH = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`;
  const ASHBY = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  const LEVER = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  for (const [type, url] of [["greenhouse", GH], ["ashby", ASHBY], ["lever", LEVER]]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (r.ok) return { ats: type, token: slug };
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  await pool.query(`ALTER TABLE all_companies ADD COLUMN IF NOT EXISTS logo_host TEXT`);
  const existing = (await pool.query("SELECT name FROM all_companies")).rows.map((r) => r.name.toLowerCase());
  const toAdd = INFRA.filter(([name]) => !existing.includes(name.toLowerCase()));
  console.log("to add:", toAdd.length, "| already present:", INFRA.length - toAdd.length);

  const now = new Date().toISOString();
  const atsCache = new Map();
  let added = 0;
  for (const [name, info] of toAdd) {
    let atsType = info.ats || null;
    let atsToken = info.token || null;
    // confirm/discover ATS if not hard-coded
    if (!atsType) {
      if (!atsCache.has(name)) atsCache.set(name, await probeAts(name));
      const found = atsCache.get(name);
      if (found) { atsType = found.ats; atsToken = found.token; }
    }
    const logo = info.logo || null;
    await pool.query(
      `INSERT INTO all_companies (name, domain, ats_type, ats_token, logo_host, source, created_at)
       VALUES ($1, NULL, $2, $3, $4, 'infra', $5)
       ON CONFLICT (name) DO NOTHING`,
      [name, atsType, atsToken, logo, now]
    );
    added++;
  }

  // DNS-resolve logo hosts for infra companies that got no explicit site but
  // no .com (fallback) — here we just ensure every infra company has some logo_host.
  const infra = (await pool.query("SELECT id, name, logo_host FROM all_companies WHERE source='infra' AND logo_host IS NULL")).rows;
  const fallbacks = [];
  for (const c of infra) {
    const host = `${slugHost(c.name)}.com`;
    if (host.length > 63) continue;
    fallbacks.push(host);
  }
  const uniq = [...new Set(fallbacks)];
  let di = 0;
  const worker = async () => { for (;;) { const i = di++; if (i >= uniq.length) return; await dnsOk(uniq[i]); } };
  await Promise.all(Array.from({ length: 32 }, worker));
  let fixed = 0;
  for (const c of infra) {
    const host = `${slugHost(c.name)}.com`;
    if (host.length <= 63 && await dnsOk(host)) { await pool.query("UPDATE all_companies SET logo_host=$1 WHERE id=$2", [host, c.id]); fixed++; }
  }

  const total = (await pool.query("SELECT COUNT(*)::int n FROM all_companies")).rows[0].n;
  const withLogo = (await pool.query("SELECT COUNT(*)::int n FROM all_companies WHERE logo_host IS NOT NULL")).rows[0].n;
  const infraCount = (await pool.query("SELECT COUNT(*)::int n FROM all_companies WHERE source='infra'")).rows[0].n;
  const infraLogo = (await pool.query("SELECT COUNT(*)::int n FROM all_companies WHERE source='infra' AND logo_host IS NOT NULL")).rows[0].n;
  console.log(`added ${added}; infra total ${infraCount}; infra with logo ${infraLogo}; overall ${withLogo}/${total}`);
  await pool.end();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });