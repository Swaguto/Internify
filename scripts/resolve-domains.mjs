// Resolves a logo host for every company in the all-tech universe so the feed
// can render a favicon logo for each row instead of falling back to the
// monogram. Uses DNS-over-HTTPS (Cloudflare) so non-`.com` TLDs resolve
// quickly without the blocking `dns.lookup` stalls seen on this environment.
// Per company, priority order:
//   1. hand-verified override domain (exact company name),
//   2. its known domain (when it is a real company site),
//   3. the origin host of its careers_url (when it is a real company site),
//   4. ATS token + TLDs (e.g. arizeai -> arizeai.com),
//   5. name slug + TLDs (e.g. coreweave -> coreweave.com).
// Both 4 & 5 use DoH so every TLD is probed until the first hit.
//
//   node scripts/resolve-domains.mjs
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

// Hand-verified real domains for companies whose brand/site differs from the
// slug/TLD probing rules (subsidiaries, acronyms, orgs, etc.).
const OVERRIDES = {
  // feed companies currently missing a logo
  "Drivetrain": "drivetrainhq.com",
  "E-Space": "e-space.com",
  "Ekimetrics": "ekimetrics.com",
  "Extreme Networks": "extremenetworks.com",
  "General Dynamics UK": "gdmissionsystems.com",
  "HCVT": "hcvt.com",
  "KOSTAL Group": "kostal.com",
  "Lawrence Livermore National Laboratory (LLNL)": "llnl.gov",
  "Reply": "reply.com",
  "Robert Bosch Venture Capital": "boschventures.com",
  "SFMOMA": "sfmoma.org",
  "Tutor Intelligence": "tutorintelligence.com",
  "VWH Capital Management": "vwhcapital.com",
  "Voltus": "voltus.com",
  "Wade Trim": "wadetrim.com",
  "Waterfall": "waterfallsolutions.com",
  "Western Digital": "westerndigital.com",
  "Winsupply": "winsupplyinc.com",
  "Xsolla": "xsolla.com",
  "Zoomifier": "zoomifier.com",
  // common large employers whose slug would otherwise miss
  "San Francisco Museum of Modern Art": "sfmoma.org",
  "Amazon": "amazon.com",
  "Apple": "apple.com",
  "Google": "google.com",
  "Meta": "meta.com",
  "Microsoft": "microsoft.com",
  "NVIDIA": "nvidia.com",
  "Tesla": "tesla.com",
  "Tesla Energy": "tesla.com",
  "SpaceX": "spacex.com",
  "OpenAI": "openai.com",
  "Anthropic": "anthropic.com",
  "xAI": "x.ai",
  "Palantir": "palantir.com",
  "Stripe": "stripe.com",
  "Snowflake": "snowflake.com",
  "Databricks": "databricks.com",
  "JPMorgan Chase": "jpmorganchase.com",
  "Goldman Sachs": "goldmansachs.com",
  "Lockheed Martin": "lockheedmartin.com",
  "Northrop Grumman": "northropgrumman.com",
  "Raytheon": "rtx.com",
  "General Atomics": "ga.com",
  "Anduril": "anduril.com",
  "Boston Dynamics": "bostondynamics.com",
  "Figure AI": "figure.ai",
  "1X Technologies": "1x.tech",
  "Intuitive Surgical": "intuitive.com",
  "Stryker": "stryker.com",
  "Medtronic": "medtronic.com",
  "Boeing": "boeing.com",
  "General Motors": "gm.com",
  "Ford": "ford.com",
  "Rivian": "rivian.com",
  "Waymo": "waymo.com",
  "Zoox": "zoox.com",
  "Cruise": "getcruise.com",
  "Siemens": "siemens.com",
  "ABB": "global.abb",
  "Fanuc": "fanuc.com",
  "Universal Robots": "universal-robots.com",
  "KUKA": "kuka.com",
  "Mitsubishi Electric": "mitsubishielectric.com",
  "Texas Instruments": "ti.com",
  "Analog Devices": "analog.com",
  "Qualcomm": "qualcomm.com",
  "Intel": "intel.com",
  "AMD": "amd.com",
  "ARM": "arm.com",
  "TSMC": "tsmc.com",
  "Broadcom": "broadcom.com",
  "Micron": "micron.com",
  "Applied Materials": "amat.com",
  "ASML": "asml.com",
  "Lam Research": "lamresearch.com",
  "Synopsys": "synopsys.com",
  "Cadence": "cadence.com",
  "CrowdStrike": "crowdstrike.com",
  "Fortinet": "fortinet.com",
  "Palo Alto Networks": "paloaltonetworks.com",
  "Nutanix": "nutanix.com",
  "VMware": "vmware.com",
  "NetApp": "netapp.com",
  "CDW": "cdw.com",
  "ADP": "adp.com",
  "Cognizant": "cognizant.com",
  "Capgemini": "capgemini.com",
  "Accenture": "accenture.com",
  "Ansys": "ansys.com",
  "Salesforce": "salesforce.com",
  "ServiceNow": "servicenow.com",
  "Workday": "workday.com",
  "Docusign": "docusign.com",
  "Okta": "okta.com",
  "Asana": "asana.com",
  "Atlassian": "atlassian.com",
  "Canva": "canva.com",
  "GitLab": "gitlab.com",
  "Harness": "harness.io",
  "HashiCorp": "hashicorp.com",
  "Splunk": "splunk.com",
  "Tableau": "tableau.com",
  "MongoDB": "mongodb.com",
  "Redis": "redis.io",
  "Elastic": "elastic.co",
  "SUSE": "suse.com",
  "Canonical": "canonical.com",
  "AWS": "aws.amazon.com",
  "Anthropic (Claude)": "anthropic.com",
};

const slugHost = (name) =>
  name.toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "")
    .replace(/^(the|and)/, "");

function careersHost(raw) {
  if (!raw) return null;
  let s = raw.trim();
  if (!/^https?:\/\//.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });

/* ------------- DNS-over-HTTPS resolution ------------- */

const TLDS = ["com", "io", "ai", "co", "org", "net", "dev", "tech", "app", "cloud", "us", "uk", "ca"];
const cached = new Map(); // hostname -> boolean (has A record)

async function probeDoh(host) {
  if (cached.has(host)) return cached.get(host);
  try {
    const r = await fetch("https://cloudflare-dns.com/dns-query?name=" + host + "&type=A", {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(6000),
    });
    const j = await r.json();
    const ok = j.Status === 0 && Array.isArray(j.Answer) && j.Answer.some((a) => a.type === 1 || a.type === 5);
    cached.set(host, ok);
    return ok;
  } catch {
    cached.set(host, false);
    return false;
  }
}

// Returns first resolving host among slug+TLDs in priority order, or null.
async function firstResolving(slug, limit = TLDS.length) {
  if (!slug) return null;
  const tried = [];
  for (let i = 0; i < limit; i++) {
    const host = slug + "." + TLDS[i];
    if (host.length > 63) continue;
    tried.push(host);
    if (await probeDoh(host)) return host;
  }
  return null;
}

async function main() {
  await pool.query(`ALTER TABLE all_companies ADD COLUMN IF NOT EXISTS logo_host TEXT`);

  const { rows } = await pool.query("SELECT id, name, domain, careers_url, ats_type, ats_token, logo_host FROM all_companies ORDER BY id");
  console.log("companies:", rows.length);

  // Companies to (re)resolve: no logo_host yet, or the current one is an ATS/
  // generic board host that renders a generic favicon instead of the company's.
  const needs = rows.filter((r) => {
    const cur = (r.logo_host || "").toLowerCase().replace(/^www\./, "");
    if (!cur) return true;
    return GENERIC_HOSTS.has(cur) || cur.endsWith(".greenhouse.io") || cur.endsWith(".ashbyhq.com") ||
      cur.endsWith(".lever.co") || cur.endsWith(".smartrecruiters.com") || cur.endsWith(".workable.com") ||
      cur.includes("myworkdayjobs.com") || cur.includes("greenhouse.io") || cur.includes("ashbyhq.com") ||
      cur.includes("lever.co");
  });
  console.log("need logo host (or have generic ATS host):", needs.length);

  const resolved = new Map(); // id -> host

  // 1. hand-verified overrides
  for (const r of needs) {
    const d = OVERRIDES[r.name];
    if (d) resolved.set(r.id, d);
  }
  console.log("via overrides:", resolved.size);

  // 2. known domain
  for (const r of needs) {
    if (resolved.has(r.id) || !r.domain) continue;
    const d = r.domain.toLowerCase().replace(/^www\./, "");
    if (d && !GENERIC_HOSTS.has(d) && !d.includes("greenhouse.io") && !d.includes("ashbyhq.com") && !d.includes("lever.co") && d.includes(".")) {
      resolved.set(r.id, d);
    }
  }
  console.log("via domain:", resolved.size);

  // 3. careers_url host
  for (const r of needs) {
    if (resolved.has(r.id)) continue;
    const host = careersHost(r.careers_url);
    if (host && !GENERIC_HOSTS.has(host) && !host.includes("greenhouse.io") && !host.includes("ashbyhq.com") && !host.includes("lever.co") && !host.includes("smartrecruiters") && !host.includes("workable")) {
      resolved.set(r.id, host);
    }
  }
  console.log("via careers_url:", resolved.size);

  // 4+5. DoH probing of ATS-token slug and name slug over the TLD list.
  const toProbe = needs.filter((r) => !resolved.has(r.id));
  console.log("needs DoH probing:", toProbe.length);

  // unique slugs, token slugs first (more precise) then name slugs
  const namesSeen = new Map(); // host base -> company id
  for (const r of toProbe) {
    const tokenSlug = (r.ats_token || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const nameSlug = slugHost(r.name);
    if (tokenSlug && tokenSlug.length >= 3 && tokenSlug.length <= 40) namesSeen.set(tokenSlug, r.id);
    if (nameSlug && nameSlug.length >= 3 && nameSlug.length <= 40) namesSeen.set(nameSlug, r.id);
  }
  const slugs = [...namesSeen.keys()];
  console.log("unique slugs to probe:", slugs.length, "over", TLDS.length, "TLDs");

  // Parallel probing with a small worker pool. First-resolving host per slug is
  // recorded after the batch so we only issue one request per host.
  let hitCount = 0;
  let done = 0;
  const matchOf = new Map();
  const BATCH = 40;
  for (let i = 0; i < slugs.length; i += BATCH) {
    const chunk = slugs.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map((s) => firstResolving(s)));
    results.forEach((host, k) => {
      if (host) { matchOf.set(chunk[k], host); hitCount++; }
    });
    done += chunk.length;
    process.stdout.write(`\r  probed ${done}/${slugs.length} (hits ${hitCount})    `);
  }
  process.stdout.write("\n");

  let viaDoh = 0;
  for (const r of toProbe) {
    if (resolved.has(r.id)) continue;
    const tokenSlug = (r.ats_token || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const nameSlug = slugHost(r.name);
    let host = null;
    if (tokenSlug.length >= 3 && tokenSlug.length <= 40) host = matchOf.get(tokenSlug) || null;
    if (!host && nameSlug.length >= 3 && nameSlug.length <= 40) host = matchOf.get(nameSlug) || null;
    if (host) {
      resolved.set(r.id, host);
      viaDoh++;
    }
  }
  console.log("via DoH:", viaDoh, "| still missing:", toProbe.length - viaDoh);

  // Everything that got a host gets a negative-cached NXDOMAIN check for the
  // chosen host: prefer registrable parent? We keep it simple: write the host.
  const updates = [...resolved.entries()];

  // Batch-write updates.
  const CHUNK = 1500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const values = chunk.map((_, k) => `($${k * 2 + 1}, $${k * 2 + 2})`).join(",");
    const params = chunk.flatMap(([id, host]) => [id, host]);
    await pool.query(
      `UPDATE all_companies ac SET logo_host = v.logo, last_error = NULL
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