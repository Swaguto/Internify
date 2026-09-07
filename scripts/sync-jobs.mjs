import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function get(url, opts = {}) {
  const timeoutMs = opts.timeoutMs || 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, "content-type": "application/json", ...opts.headers },
      ...opts,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function post(url, body, timeoutMs = 20000) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/* ---------- source: greenhouse ---------- */
const GH_INTERN =
  /\bintern(?:ship)?(?:s)?\b|\b(undergrad|university|graduate|new grad|new-grad|early career|co-op)\b/i;

async function fetchGreenhouse(token, company) {
  const data = await get(
    `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=false`
  );
  const out = [];
  for (const j of data.jobs || []) {
    const loc = (j.location?.name || "").toLowerCase();
    const isUS =
      /(^|,|\s)((al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc|nyc)\b)/i.test(loc) ||
      /united states|remote|new york|san francisco|los angeles|seattle|austin|boston|chicago|mountain view|cupertino|redmond|palo alto|menlo park|bellevue|new york city/i.test(loc);
    if (!GH_INTERN.test(j.title)) continue;
    if (!isUS) continue;
    out.push({
      company,
      title: j.title,
      location: j.location?.name || "",
      updated_at: j.updated_at,
      url: j.absolute_url,
      meta: j.metadata?.find?.((m) => /location type/i.test(m.name))?.value || "",
    });
  }
  out.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return out;
}

/* ---------- source: lever ---------- */
async function fetchLever(slug, company) {
  const data = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  const intern = /\bintern(?:ship)?s?\b|undergrad|university|graduate|new grad|new-grad|early career|co-op/i;
  const out = [];
  for (const j of data) {
    if (!intern.test(j.text)) continue;
    const locs = [j.categories?.location, j.categories?.allLocations]
      .flat()
      .filter(Boolean)
      .join(" ");
    const loc = (locs + " " + (j.workplaceType || "")).toLowerCase();
    if (!/(remote|united states|ny|sf|ca|wa|nyc|new york|san francisco|seattle|palo alto|menlo park|mountain view|los angeles|austin|boston|chicago)|, (ny|ca|wa|tx|ma|ga|il)\b| usa/i.test(loc))
      continue;
    out.push({
      company,
      title: j.text,
      location: [j.categories?.allLocations ?? j.categories?.location].flat().filter(Boolean).join("; "),
      updated_at: new Date(j.createdAt).toISOString(),
      url: j.hostedUrl || `https://jobs.lever.co/${slug}/${j.id}`,
      meta: j.workplaceType || "",
    });
  }
  return out;
}

/* ---------- source: ashby ---------- */
async function fetchAshby(slug, company) {
  const data = await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  const intern = /\bintern(?:ship)?s?\b|undergrad|university|graduate|new grad|new-grad|early career|co-op/i;
  const out = [];
  for (const j of data.jobs || []) {
    if (!intern.test(j.title)) continue;
    const extra = (j.secondaryLocations || []).map((s) => s.location || "").join(" ");
    const loc = (j.location + " " + extra).toLowerCase();
    if (!/(remot|\bunited states\b|new york|san francisco|los angeles|seattle|austin|boston|chicago|mountain view|palo alto|menlo park|bellevue|redmond|cupertino|sunnyvale)/i.test(loc)) continue;
    out.push({
      company,
      title: j.title,
      location: j.location || "",
      updated_at: j.publishDate ? new Date(j.publishDate).toISOString() : new Date(0).toISOString(),
      url: j.jobUrl || j.applyUrl,
      meta: "",
    });
  }
  return out;
}

/* ---------- source: workable ---------- */
async function fetchWorkable(slug, company) {
  const data = await get(`https://${slug}.workable.com/api/v3/widget/accounts/${slug}`);
  const intern = /\bintern(?:ship)?s?\b|undergrad|university|graduate|new grad|new-grad|early career|co-op/i;
  const out = [];
  for (const j of data.jobs || []) {
    if (!intern.test(j.title)) continue;
    const loc = (j.location || "").toLowerCase();
    if (!/(remote|united states|new york|san francisco|seattle|austin|boston|chicago|los angeles)/i.test(loc)) continue;
    out.push({
      company,
      title: j.title,
      location: j.location || "",
      updated_at: j.updated_at || new Date().toISOString(),
      url: j.url,
      meta: "",
    });
  }
  return out;
}

/* ---------- source: amazon ---------- */
async function fetchAmazon() {
  const queries = [
    "software%20development%20engineer%20intern",
    "software%20engineer%20intern",
    "applied%20scientist%20intern",
    "machine%20learning%20intern",
  ];
  const combos = [];
  for (const q of queries) for (let page = 1; page <= 2; page++) combos.push([q, page]);

  const seen = new Set();
  const out = [];
  const workers = Array.from({ length: Math.min(4, combos.length) }, async () => {
    while (combos.length) {
      const [q, page] = combos.shift();
      let data;
      try {
        data = await get(
          `https://www.amazon.jobs/en/search.json?base_query=${q}&country%5B%5D=USA&page=${page}&sort=recent`
        );
      } catch {
        continue;
      }
      for (const j of data.jobs || []) {
        if (j.country_code !== "USA") continue;
        if (!j.is_intern && !/\bintern(?:ship(?:s)?)?\b/i.test(j.title)) continue;
        const key = `${j.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const num = (j.url_next_step || "").match(/jobs\/(\d+)\//);
        out.push({
          company: "Amazon",
          title: j.title,
          location: `${j.city}, ${j.state}`,
          updated_at: parseAgoDate(j.posted_date),
          url: num ? `https://www.amazon.jobs/en/jobs/${num[1]}` : `https://www.amazon.jobs/en/jobs/${j.id}`,
          meta: "On-Site",
        });
      }
    }
  });
  await Promise.all(workers);
  return out;
}
function parseAgoDate(s) {
  if (!s) return new Date().toISOString();
  const m = s.match(/^(\w+) {1,2}(\d{1,2}), (\d{4})$/);
  if (m) return new Date(`${m[1]} ${m[2]}, ${m[3]}`).toISOString();
  return new Date().toISOString();
}

/* ---------- source: nvidia workday ---------- */
async function fetchNvidia() {
  const stateRe = /\b(CA|WA|TX|MA|GA|IL|NC|OR|NY|CO|AZ|UT|NJ|MN|MD|VA|FL|PA|NH|MI|OH|SC|IN|ID|MT|RI|DE|TN|WI)\b/;
  const offsets = [];
  for (let offset = 0; offset <= 180; offset += 20) offsets.push(offset);
  const rawRecords = [];
  const workers = Array.from({ length: Math.min(3, offsets.length) }, async () => {
    while (offsets.length) {
      const offset = offsets.shift();
      let data = {};
      try {
        const res = await post(
          "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs",
          { appliedFacets: {}, limit: 20, offset, searchText: "intern" }
        );
        data = await res.json();
      } catch {
        continue;
      }
      rawRecords.push(...(data.jobPostings || []));
    }
  });
  await Promise.all(workers);

  const out = [];
  for (const j of rawRecords) {
    if (!/\bintern(?:ship(?:s)?)?\b/i.test(j.title)) continue;
    const loc = j.locationsText || "";
    if (!stateRe.test(loc) && !/remote|united states/i.test(loc)) continue;
    out.push({
      company: "NVIDIA",
      title: j.title,
      location: loc.replace(/, United States\s*$/i, ""),
      updated_at: agoIso(j.postedOn),
      url: `https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite${j.externalPath}`,
      meta: /remote/i.test(loc) ? "Remote" : "On-Site",
    });
  }
  const seen = new Set();
  return out.filter((r) => {
    const k = `${r.title}|${r.location}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function agoIso(s) {
  if (!s) return new Date().toISOString();
  const m = s.match(/(\d+)\+?\s*(minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return new Date().toISOString();
  const n = +m[1];
  const units = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2629800000, year: 31557600000 };
  return new Date(Date.now() - n * units[m[2].toLowerCase()]).toISOString();
}

/* ---------- source: generic workday cxs ---------- */
async function fetchWorkday(tenant, site, company, wdInstance = "1") {
  const endpoint = `https://${tenant}.wd${wdInstance}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const stateRe = /\b(CA|WA|TX|MA|GA|IL|NC|OR|NY|CO|AZ|UT|NJ|MN|MD|VA|FL|PA|NH|MI|OH|SC|IN|ID|MT|RI|DE|TN|WI|DC)\b|united states|remote|u\.s\.|usa\b/i;
  const out = [];
  const seen = new Set();
  for (let offset = 0; offset < 800 && out.length < 600; offset += 20) {
    let data = null;
    for (let attempt = 0; attempt < 3 && !data; attempt++) {
      try {
        const res = await post(endpoint, { appliedFacets: {}, limit: 20, offset, searchText: "intern" });
        if (!res.ok) break;
        data = await res.json();
      } catch {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    if (!data) break;
    const jp = data.jobPostings || [];
    if (!jp.length) break;
    for (const j of jp) {
      const title = j.title || "";
      if (!GH_INTERN.test(title)) continue;
      const loc = j.locationsText || "";
      if (!stateRe.test(loc)) continue;
      const key = `${title}|${loc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        company,
        title,
        location: loc.replace(/, United States\s*$/i, ""),
        updated_at: agoIso(j.postedOn),
        url: `https://${tenant}.wd${wdInstance}.myworkdayjobs.com/en-US/${site}${j.externalPath || ""}`,
        meta: /remote/i.test(loc) ? "Remote" : "On-Site",
      });
    }
  }
  return out;
}

/* ---------- helpers ---------- */
const DOMAIN = (name) =>
  ({
    Amazon: "amazon.com", Apple: "apple.com", Google: "google.com", Meta: "meta.com",
    Microsoft: "microsoft.com", Tesla: "tesla.com", Netflix: "netflix.com", NVIDIA: "nvidia.com",
    Uber: "uber.com", Palantir: "palantir.com", Notion: "notion.so", "Scale AI": "scale.com",
    Anthropic: "anthropic.com", Stripe: "stripe.com", Snowflake: "snowflake.com",
    Databricks: "databricks.com", Robinhood: "robinhood.com", Datadog: "datadoghq.com",
    Figma: "figma.com", Vercel: "vercel.com", Waymo: "waymo.com", Anduril: "anduril.com",
    Cohere: "cohere.com", Twitch: "twitch.tv", Postman: "postman.com", Roblox: "roblox.com",
    Optiver: "optiver.com", CockroachLabs: "cockroachlabs.com",
  }[name] || name.toLowerCase().replace(/\s+/g, ""));

const EXCLUDE =
  /\b(recruit(?:er|ing)?|talent|human resources|\bhr\b|marketing|sales(?:person| rep| associate)?|content (?:design(?:er)?|writer)|program manager|product manag(?:er|ement)|technical program manager|business (?:development|analyst)|associate product manager|customer experience|support (?:specialist|associate)|operations (?:manager|planning)|ux researcher|product design|\bdesign(?:er)?\b|\bdesign intern|people (?:ops|team)|public policy|legal|accounting|brand|communications|social media|community|strategist|careers (?:specialist|coordinator)|early careers & (?:interns )?(?:specialist|coordinator)|interns specialist)\b/i;

const NON_US =
  /\b(canada|united kingdom|\buk\b|london|toronto|waterloo|zurich|berlin|paris|dublin|amsterdam|singapore|india|mexico|sao paulo|tel aviv|israel|japan|tokyo|beijing|shanghai|sydney|hong kong|munich|stockholm|oslo|copenhagen|sweden|netherlands|switzerland|ireland|germany|france|barcelona|madrid|australia)\b/i;
const US_MARKER = /\b(united states|\busa\b|, [A-Z]{2}\b|california|washington|new york|texas|massachusetts|illinois|colorado|virginia|north carolina|oregon)\b/i;

const ROBOTICS_COMPANIES = /^(nvidia|waymo|zoox|nuro|skydio|shield ai|anduril|figure ai|apptronik|physical intelligence|1x technologies|boston dynamics|agility robotics|sanctuary ai|skild ai|unitree|covariant|fourier|waabi|torc|kodiak|gatik|ghost robotics|saronic|aurora|cruise|autonomous|robotics|robot)/i;

function category(title, companyName) {
  const t = title.toLowerCase();
  const c = (companyName || "").toLowerCase();
  if (/(robotics|autonomous|locomotion|manipulation|perception|slam|ros\b|navigation2|nav2|simulation|embodied|grasp|locomot)/i.test(t)) return "Robotics";
  if (ROBOTICS_COMPANIES.test(c)) return "Robotics";
  if (/(machine learning|ml engineer|ml engineering|research engineer|ai\/ml|artificial intelligence|deep learning|llm|applied scientist)/i.test(t)) return "AI/ML";
  if (/(trader|trading|derivatives|market making|quantitative (analyst|developer|researcher)|portfolio|hedge fund|market microstructure)\b/i.test(t)) return "Quant";
  if (/(embedded|systems|infrastructure|platform|network|sre|site reliability|storage|database|firmware|hardware|devops|security)/i.test(t)) return "Systems/Infrastructure";
  return "SWE";
}

function workType(loc, meta) {
  const s = `${loc} ${meta}`.toLowerCase();
  if (/remote/.test(s)) return "Remote";
  if (/hybrid/.test(s)) return "Hybrid";
  return "On-Site";
}

function season(title) {
  const m = title.match(/(spring|summer|fall|winter)\s*(?:co-op|intern(?:ship)?)?[^-\d]*\s?(20\d\d)?/i);
  if (m) {
    const parts = [m[1] && m[1][0].toUpperCase() + m[1].slice(1), m[2]].filter(Boolean);
    return parts.join(" ");
  }
  const yr = title.match(/20\d\d/);
  return yr ? yr[0] : "Rolling";
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
}

/* ---------- location normalizer ---------- */
const STATE_NAME_TO_ABBR = {
  California: "CA", Washington: "WA", "New York": "NY", Texas: "TX",
  Massachusetts: "MA", Georgia: "GA", Illinois: "IL", "North Carolina": "NC",
  Oregon: "OR", Colorado: "CO", Arizona: "AZ", Utah: "UT", "New Jersey": "NJ",
  Minnesota: "MN", Maryland: "MD", Virginia: "VA", Florida: "FL", Pennsylvania: "PA",
  "New Hampshire": "NH", Michigan: "MI", Ohio: "OH", "South Carolina": "SC",
  Indiana: "IN", Idaho: "ID", Montana: "MT", "Rhode Island": "RI", Delaware: "DE",
  Tennessee: "TN", Wisconsin: "WI", Connecticut: "CT", "District of Columbia": "DC",
  Nevada: "NV", Missouri: "MO", Kansas: "KS", "New Mexico": "NM", Iowa: "IA",
  Alabama: "AL", Alaska: "AK", Arkansas: "AR", "North Dakota": "ND", "South Dakota": "SD",
  Vermont: "VT", Wyoming: "WY", "West Virginia": "WV", Denver: "CO",
};

function normalizeLocation(loc) {
  let s = loc;
  s = s.replace(/,\s*United States$/i, "");
  s = s.replace(/\bUSA\b/gi, "");
  s = s.replace(/\s*;\s*/g, "; ");
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (STATE_NAME_TO_ABBR[last]) {
      parts[parts.length - 1] = STATE_NAME_TO_ABBR[last];
      s = parts.join(", ");
    } else if (/^[A-Z]{2}$/.test(last)) {
      s = parts.join(", ");
    }
  }
  s = s.replace(/New York City/g, "New York");
  if (/^New York$/.test(s)) s = "New York, NY";
  if (/^San Francisco$/.test(s)) s = "San Francisco, CA";
  if (/^Los Angeles$/.test(s)) s = "Los Angeles, CA";
  if (/^Seattle$/.test(s)) s = "Seattle, WA";
  if (s.length > 60) s = s.slice(0, 57) + "...";
  return s.trim();
}

/* ---------- ATS discovery ---------- */
function discoverFromUrl(careersUrl) {
  if (!careersUrl) return null;
  let m;
  if ((m = careersUrl.match(/boards\.greenhouse\.io\/([a-z0-9_-]+)/i)))
    return { type: "greenhouse", token: m[1] };
  if ((m = careersUrl.match(/(?:www\.)?([a-z0-9-]+)\.greenhouse\.io/i)))
    return { type: "greenhouse", token: m[1] };
  if ((m = careersUrl.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i)))
    return { type: "lever", slug: m[1] };
  if ((m = careersUrl.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i)))
    return { type: "ashby", slug: m[1] };
  if (/(amazon\.jobs|amazon\.com\/jobs)/i.test(careersUrl)) return { type: "amazon" };
  if (/\.wd\d+\.myworkdayjobs\.com/i.test(careersUrl) || /nvidia|workday/i.test(careersUrl)) {
    const wdm = careersUrl.match(/https?:\/\/([\w-]+)\.wd(\d+)\.myworkdayjobs\.com/i);
    if (wdm) {
      const tenant = wdm[1];
      const wdInstance = wdm[2];
      let site = (careersUrl.match(/\/wday\/cxs\/[\w-]+\/([\w-]+)\/jobs/i) || [])[1] || null;
      if (!site) {
        const segs = careersUrl
          .split("/")
          .filter(Boolean)
          .filter((s) => !/^[a-z]{2,3}-[A-Z]{2}$/.test(s) && !/^[a-z]{2,3}$/i.test(s));
        site = segs[segs.length - 1];
      }
      if (site) return { type: "workday", token: tenant, site, wdInstance };
    }
    return { type: "nvidia" };
  }
  return null;
}

async function probe(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function discoverByName(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (await probe(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`))
    return { type: "greenhouse", token: slug };
  if (await probe(`https://api.ashbyhq.com/posting-api/job-board/${slug}`))
    return { type: "ashby", slug };
  if (await probe(`https://api.lever.co/v0/postings/${slug}?mode=json`))
    return { type: "lever", slug };
  if (/amazon/i.test(name)) return { type: "amazon" };
  if (/nvidia/i.test(name)) return { type: "nvidia" };
  return null;
}

/* ---------- run sync ---------- */
export async function runSync() {
  // Auto-load .env.local if DATABASE_URL is not set
  if (!process.env.DATABASE_URL) {
    try {
      const { readFileSync: rf } = await import("node:fs");
      const envPath = resolve(ROOT, ".env.local");
      const envContent = rf(envPath, "utf8");
      for (const line of envContent.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#") || !t.includes("=")) continue;
        const eq = t.indexOf("=");
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (!process.env[k]) {
          try { const u = new URL(v); u.searchParams.delete("channel_binding"); process.env[k] = u.toString(); } catch { process.env[k] = v; }
        }
      }
    } catch {}
  }

  const { Pool } = await import("pg");
  const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  let connStr = rawUrl;
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      u.searchParams.delete("channel_binding");
      connStr = u.toString();
    } catch {}
  }
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        domain TEXT,
        careers_url TEXT,
        ats_type TEXT,
        ats_token TEXT,
        track_only BOOLEAN NOT NULL DEFAULT FALSE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        last_fetched TEXT,
        last_error TEXT,
        last_probe TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT,
        url TEXT,
        posted_at TEXT,
        compensation TEXT,
        category TEXT,
        work_type TEXT,
        season TEXT,
        sponsorship TEXT DEFAULT 'Unknown',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        first_seen TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_id, source_id)
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(active)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category)");
    await client.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_probe TEXT");
  } finally {
    client.release();
  }

  let reg;
  try {
    reg = JSON.parse(readFileSync(resolve(ROOT, "lib/companies.json"), "utf8"));
  } catch {
    console.error("lib/companies.json not found");
    return;
  }

  for (const c of reg.companies || []) {
    const atsType = c.ats?.type || null;
    const atsToken = c.ats?.token || c.ats?.slug || null;
    await pool.query(
      `INSERT INTO companies (name, domain, careers_url, ats_type, ats_token, track_only, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         domain = COALESCE(EXCLUDED.domain, companies.domain),
         careers_url = COALESCE(EXCLUDED.careers_url, companies.careers_url),
         ats_type = COALESCE(EXCLUDED.ats_type, companies.ats_type),
         ats_token = COALESCE(EXCLUDED.ats_token, companies.ats_token),
         track_only = EXCLUDED.track_only`,
      [c.name, c.domain || null, c.careersUrl || null, atsType, atsToken, c.trackOnly || false, new Date().toISOString()]
    );
  }

  const companiesRes = await pool.query(
    "SELECT * FROM companies WHERE enabled = TRUE AND track_only = FALSE ORDER BY (last_fetched IS NULL) DESC, id"
  );
  const companies = companiesRes.rows;
  const domains = new Map(
    companies.filter((c) => c.domain).map((c) => [c.name.toLowerCase(), c.domain])
  );

  const results = [];
  const failed = [];
  let cursor = 0;

  async function processCompany(c) {
    let ats = c.ats_type ? { type: c.ats_type } : null;
    if (ats) ats[c.ats_type === "greenhouse" ? "token" : "slug"] = c.ats_token;
    if (!ats) ats = discoverFromUrl(c.careers_url);
    if (!ats) {
      const alreadyFailed = (c.last_error || "").startsWith("no discoverable");
      const probedRecently =
        c.last_probe && Date.now() - new Date(c.last_probe).getTime() < 6 * 60 * 60 * 1000;
      if (!(alreadyFailed && probedRecently)) {
        ats = await discoverByName(c.name);
      }
      await pool.query("UPDATE companies SET last_probe = $1 WHERE id = $2", [new Date().toISOString(), c.id]);
    }
    if (!ats) {
      failed.push(`${c.name} (no discoverable ATS)`);
      await pool.query("UPDATE companies SET last_error = $1 WHERE id = $2", ["no discoverable ATS", c.id]);
      return;
    }
    if (ats.type === "amazon" && c.name !== "Amazon") {
      await pool.query("UPDATE jobs SET active = FALSE WHERE company_id = $1 AND active = TRUE", [c.id]);
      await pool.query("UPDATE companies SET last_fetched = $1, last_error = NULL WHERE id = $2", [new Date().toISOString(), c.id]);
      return;
    }
    try {
      let jobs;
      if (ats.type === "amazon") jobs = await fetchAmazon();
      else if (ats.type === "nvidia") jobs = await fetchNvidia();
      else if (ats.type === "workday") {
        const tenant = ats.token || ats.slug;
        const w = c.careers_url ? discoverFromUrl(c.careers_url) : null;
        const site = w?.type === "workday" ? w.site : tenant ? `${tenant.charAt(0).toUpperCase()}${tenant.slice(1)}Careers` : null;
        const wdInstance = w?.type === "workday" ? w.wdInstance : "1";
        if (site) jobs = await fetchWorkday(tenant, site, c.name, wdInstance);
        else throw new Error("workday site unknown");
      }
      else {
        const fetcher =
          ats.type === "greenhouse" ? fetchGreenhouse : ats.type === "lever" ? fetchLever : ats.type === "ashby" ? fetchAshby : ats.type === "workable" ? fetchWorkable : null;
        if (!fetcher) throw new Error(`unknown ats ${ats.type}`);
        const key = ats.token || ats.slug;
        jobs = await fetcher(key, c.name);
      }
      results.push(...jobs);

      const seenD = new Set();
      jobs = jobs
        .filter((j) => {
          const k = j.title.toLowerCase();
          if (seenD.has(k)) return false;
          seenD.add(k);
          return true;
        })
        .filter((j) => !EXCLUDE.test(j.title))
        .filter((j) => !(NON_US.test(j.location) && !US_MARKER.test(j.location)))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 4);

      for (const j of jobs) {
        const sid = slugify(`${c.name}-${j.title}`);
        const now = new Date().toISOString();
        await pool.query(
          `INSERT INTO jobs (company_id, source_id, title, location, url, posted_at, compensation, category, work_type, season, sponsorship, active, first_seen, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::text, $8, $9, $10, $11, TRUE, $12, $12)
           ON CONFLICT (company_id, source_id) DO UPDATE SET
             title = EXCLUDED.title, location = EXCLUDED.location, url = EXCLUDED.url,
             posted_at = EXCLUDED.posted_at, category = EXCLUDED.category, work_type = EXCLUDED.work_type,
             season = EXCLUDED.season, sponsorship = EXCLUDED.sponsorship, active = TRUE, updated_at = EXCLUDED.updated_at`,
          [c.id, sid, j.title, normalizeLocation(j.location), j.url, j.updated_at, null, category(j.title, c.name), workType(j.location, j.meta), season(j.title), "Unknown", now]
        );
      }

      const activeIds = jobs.map((j) => slugify(`${c.name}-${j.title}`));
      if (activeIds.length > 0) {
        const ph = activeIds.map((_, i) => `$${i + 2}::text`).join(",");
        await pool.query(
          `UPDATE jobs SET active = FALSE WHERE company_id = $1 AND active = TRUE AND source_id NOT IN (${ph})`,
          [c.id, ...activeIds]
        );
      } else {
        await pool.query("UPDATE jobs SET active = FALSE WHERE company_id = $1 AND active = TRUE", [c.id]);
      }

      await pool.query("UPDATE companies SET last_fetched = $1, last_error = NULL WHERE id = $2", [new Date().toISOString(), c.id]);
      if (!c.ats_type && ats.type !== "amazon") {
        await pool.query("UPDATE companies SET ats_type = $1, ats_token = $2 WHERE id = $3", [ats.type, ats.token || ats.slug || null, c.id]);
      }
      console.log(`fetched ${jobs.length} jobs from ${c.name} (${c.ats_type || "discovered"})`);
    } catch (exc) {
      failed.push(c.name);
      await pool.query("UPDATE companies SET last_error = $1 WHERE id = $2", [String(exc).slice(0, 500), c.id]);
      console.log(`FAILED ${c.name}: ${exc}`);
    }
  }

  const CONCURRENCY = 5;
  const workers = Array.from({ length: Math.min(CONCURRENCY, companies.length) }, async () => {
    while (cursor < companies.length) {
      const c = companies[cursor++];
      await processCompany(c);
    }
  });
  await Promise.all(workers);

  const jobCount = await pool.query("SELECT COUNT(*) as count FROM jobs WHERE active = TRUE");
  console.log(`done: ${results.length} raw candidates -> ${jobCount.rows[0].count} active jobs across ${new Set(results.map((r) => r.company)).size} companies`);
  if (failed.length) console.log("errors:", failed.join(", "));

  await pool.end();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSync();
}
