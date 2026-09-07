// Bulk scraper for the "all tech" feed. Runs against the 2000+ company
// universe in lib/companies-all.json, storing into all_companies / all_jobs.
// Designed for cron-driven batches via /api/sync-all (cursor-resumable within
// a Vercel function's time budget) and for full local runs.
//
//   node scripts/sync-all.mjs                 (full pass)
//   node scripts/sync-all.mjs --limit 120     (start at cursor, N companies)

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const UA = "Mozilla/5.0 (compatible; InternifyBot/1.0; +https://internify.app)";
const BATCH = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? process.env.BATCH ?? 120);
const TIME_LIMIT_MS = Number(process.argv.find((a) => a.startsWith("--time-limit="))?.split("=")[1] ?? 55_000);
const CONCURRENCY = 8;
const PROBE_THROTTLE_MS = 24 * 60 * 60 * 1000;

let pool;
async function getEnv() {
  if (!process.env.DATABASE_URL) {
    try {
      const envPath = resolve(ROOT, ".env.local");
      if (!existsSync(envPath)) throw new Error("missing .env.local");
      for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#") || !t.includes("=")) continue;
        const eq = t.indexOf("=");
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v;
      }
    } catch (e) {
      throw new Error(`DATABASE_URL not set and .env.local unreadable: ${e}`);
    }
  }
  const raw = process.env.DATABASE_URL;
  try {
    const url = new URL(raw);
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return raw;
  }
}

async function get(url, timeoutMs = 20_000) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ---------------- filters ---------------- */

const INTERN_ROLE =
  /\bintern(?:ship(?:s)?)?\b|\bco[- ]?op\b|\bcampus\b|\bnew\s*grad(?:uate)?\b|\bapprentice(?:ship)?\b|\bearly\s*(?:career|in[- ]career|-career)\b|\buniversity\b|\bstudent\b|\bgraduate\b/i;

const EXCLUDE =
  /\b(recruit(?:er|ing)?|talent|human resources|\bhr\b|marketing|sales(?:person| rep| associate)?|content (?:design(?:er)?|writer)|program manager|product manag(?:er|ement)|technical program manager|business (?:development|analyst)|associate product manager|customer experience|support (?:specialist|associate)|operations (?:manager|planning)|ux researcher|product design|\bdesign(?:er)?\b|\bdesign intern|people (?:ops|team)|public policy|legal|accounting|brand|communications|social media|community|strategist|careers (?:specialist|coordinator)|volunteer|stylist|makeup|hairdresser|photographer|model\b|wrestler|athlete\b|coach\b|event planning|advisory board|journalist|writer\b|operations (?:&|and) logistics|ops intern|logistics intern)\b/i;

const US_STATES =
  /\b(AK|AL|AR|AZ|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|PR|RI|SC|SD|TN|TX|UT|VA|VI|VT|WA|WI|WV|WY|GU|AS|MP)\b/;
const US_MARKER = /\b(united states|\busa\b|california|washington|new york|texas|massachusetts|illinois|colorado|virginia|north carolina|oregon)\b/i;
const INTL_MARKER =
  /\b(united kingdom|\buk\b|london|zurich|berlin|paris|dublin|amsterdam|singapore|india|mexico|sao paulo|brazil|tel aviv|israel|japan|tokyo|beijing|shanghai|sydney|hong kong|munich|stockholm|oslo|copenhagen|sweden|netherlands|switzerland|ireland|germany|france|barcelona|madrid|australia|new zealand|poland|warsaw|krakow|prague|czech|spain|italy|milan|rome|portugal|lisbon|ukraine|kiev|vienna|austria|belgium|brussels|luxembourg|europe|rotterdam|edinburgh|glasgow|manchester|abudhabi|dubai|seoul|south korea|taiwan|thailand|indonesia|vietnam|brasil|argentina|chile|colombia|peru|ecuador|uruguay|venezuela|panama|costa rica|guatemala|cuba|jamaica|bahamas|russia|baku|almaty|new delhi|mumbai|hyderabad|chennai|pune|bangalore|bengaluru|colombo|philippines|malaysia|jakarta|manila|hanoi|ho chi minh|nairobi|lagos|johannesburg|cape town|cairo|istanbul|ankara|budapest|warsaw|bucharest|sofia|belgrade|riga|vilnius|tallinn|reykjavik|luxembourg)\b/i;
const CANADA_MARKER =
  /\b(canada|ontario|toronto|waterloo|vancouver|montreal|calgary|ottawa|edmonton|mississauga|guelph|kitchener|quebec|alberta|british columbia|manitoba|nova scotia|saskatchewan|\bon\b|\bbc\b|\bqc\b|\bab\b|\bmb\b)\b/i;

function usOrCa(loc) {
  if (!loc) return true;
  if (/remote|anywhere/i.test(loc)) return true;
  const s = loc;
  if (/(^|[,\s])(united states|usa|canada|u\.s\.)\b/i.test(s)) return true;
  const codes = s.match(/\b[A-Z]{2,3}\b/g) || [];
  for (const t of codes) {
    if (t.length === 3) {
      if (t !== "USA" && t !== "CAN") return false;
    } else if (!US_STATES.test(t)) {
      return false; // two-letter suffix that isn't a US state (UK, BY, NH, BR, ...)
    }
  }
  if (US_MARKER.test(s)) return true;
  if (CANADA_MARKER.test(s)) return true;
  if (INTL_MARKER.test(s)) return false;
  return true;
}

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

const STATE_NAME_TO_ABBR = {
  California: "CA", Washington: "WA", "New York": "NY", Texas: "TX",
  Massachusetts: "MA", Georgia: "GA", Illinois: "IL", "North Carolina": "NC",
  Oregon: "OR", Colorado: "CO", Arizona: "AZ", Utah: "UT", "New Jersey": "NJ",
  Minnesota: "MN", Maryland: "MD", Virginia: "VA", Florida: "FL", Pennsylvania: "PA",
  "New Hampshire": "NH", Michigan: "MI", Ohio: "OH", "South Carolina": "SC",
  Indiana: "IN", Idaho: "ID", Montana: "MT", "Rhode Island": "RI", Delaware: "DE",
  Tennessee: "TN", Wisconsin: "WI", Connecticut: "CT", "District of Columbia": "DC",
  Nevada: "NV", Missouri: "MO", Kansas: "KS", "New Mexico": "NM", Iowa: "IA",
  Alabama: "AL", Alaska: "AK", Arkansas: "AR", "North Dakota": "ND",
  "South Dakota": "SD", Vermont: "VT", Wyoming: "WY", "West Virginia": "WV",
  Ontario: "ON", "British Columbia": "BC", Quebec: "QC", Alberta: "AB",
  Manitoba: "MB", "Nova Scotia": "NS", Saskatchewan: "SK",
};

function normalizeLocation(loc) {
  let s = loc || "";
  s = s.replace(/,\s*United States$/i, "");
  s = s.replace(/\bUSA\b/gi, "");
  s = s.replace(/,\s*Canada$/i, "");
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (STATE_NAME_TO_ABBR[last]) parts[parts.length - 1] = STATE_NAME_TO_ABBR[last];
    s = parts.join(", ");
  }
  s = s.replace(/New York City/g, "New York");
  if (/^New York$/.test(s)) s = "New York, NY";
  if (/^San Francisco$/.test(s)) s = "San Francisco, CA";
  if (/^Los Angeles$/.test(s)) s = "Los Angeles, CA";
  if (/^Seattle$/.test(s)) s = "Seattle, WA";
  if (/^Toronto$/.test(s)) s = "Toronto, ON";
  if (/^Vancouver$/.test(s)) s = "Vancouver, BC";
  if (/^Montreal$/i.test(s)) s = "Montréal, QC";
  if (/^Calgary$/.test(s)) s = "Calgary, AB";
  if (/^Waterloo$/.test(s)) s = "Waterloo, ON";
  if (s.length > 60) s = s.slice(0, 57) + "...";
  return s.trim();
}

/* ---------------- ATS fetchers ---------------- */

async function fetchGreenhouse(token, company) {
  const data = await get(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=false`);
  const out = [];
  for (const j of data.jobs || []) {
    out.push({
      title: j.title,
      location: j.location?.name || "",
      url: j.absolute_url || `https://boards.greenhouse.io/${token}/jobs/${j.id}`,
      date: j.updated_at,
      meta: "",
    });
  }
  return out;
}

async function fetchAshby(slug, company) {
  const data = await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  const out = [];
  for (const j of data.jobs || []) {
    const locs = [j.location, ...(j.secondaryLocations || [])].filter(Boolean).map((l) => (typeof l === "string" ? l : l?.name || "")).join(", ");
    let pay = "";
    if (j.compensation?.compensationTierSummary) pay = j.compensation.compensationTierSummary;
    out.push({
      title: j.title,
      location: locs || (j.isRemote ? "Remote" : ""),
      url: j.jobUrl || `https://jobs.ashbyhq.com/${slug}`,
      date: j.publishedAt,
      meta: j.isRemote ? "Remote" : "",
      pay,
    });
  }
  return out;
}

async function fetchLever(slug) {
  const data = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  const out = [];
  for (const j of data || []) {
    out.push({
      title: j.text,
      location: j.categories?.location || "",
      url: j.hostedUrl || `https://jobs.lever.co/${slug}`,
      date: j.createdAt,
      meta: j.workplaceType || (j.categories?.commitment || ""),
    });
  }
  return out;
}

async function fetchSmartRecruiters(co) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const url = `https://api.smartrecruiters.com/v1/companies/${co}/postings?limit=100&offset=${offset}`;
    let data;
    try {
      data = await get(url);
    } catch {
      break;
    }
    const list = data.content || [];
    for (const j of list) {
      const loc = j.location ? `${j.location.city || ""}${j.location.region ? `, ${j.location.region}` : ""}`.trim() : "";
      out.push({
        title: j.name,
        location: loc,
        url: `https://jobs.smartrecruiters.com/${co}/${j.id}`,
        date: j.releasedDate,
        meta: "",
        country: j.location?.country || "",
      });
    }
    if (offset + 100 >= (data.totalFound || 0)) break;
    if (out.length > 500) break;
  }
  return out;
}

async function fetchAmazon() {
  const out = [];
  const seen = new Set();
  const queries = ["intern", "co-op", "student", "early career"];
  for (const q of queries) {
    for (const country of ["USA", "CAN"]) {
      for (let offset = 0; offset < 2; offset++) {
        const url = `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}&country[]=${country}&offset=${offset * 100}&result_limit=100`;
        let data;
        try {
          data = await get(url, 15_000);
        } catch {
          continue;
        }
        for (const j of data.jobs || []) {
          if (seen.has(j.id_icims)) continue;
          seen.add(j.id_icims);
          out.push({
            title: j.title,
            location: j.normalized_location || j.location || "",
            url: `https://www.amazon.jobs/en/jobs/${j.id_icims}`,
            date: j.posted_date || "",
            meta: "",
            country: j.country_code || "",
          });
        }
      }
    }
  }
  return out;
}

/* ---------- source: generic workday cxs ---------- */
async function fetchWorkday(tenant, site, company, wdInstance = "1") {
  const endpoint = `https://${tenant}.wd${wdInstance}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const out = [];
  const seen = new Set();
  for (let offset = 0; offset < 800 && out.length < 600; offset += 20) {
    let data = null;
    for (let attempt = 0; attempt < 3 && !data; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": UA, accept: "application/json" },
          body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "intern" }),
          signal: AbortSignal.timeout(20_000),
        });
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
      const loc = j.locationsText || "";
      const key = `${j.title}|${loc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        title: j.title || "",
        location: loc.replace(/, United States\s*$/i, ""),
        url: `https://${tenant}.wd${wdInstance}.myworkdayjobs.com/en-US/${site}${j.externalPath || ""}`,
        date: j.postedOn || "",
        meta: /remote/i.test(loc) ? "Remote" : "On-Site",
        country: /united states/i.test(loc) ? "USA" : /canada/i.test(loc) ? "CAN" : "",
      });
    }
  }
  return out;
}

/* ---------------- ATS URL discovery ---------------- */
function discoverFromUrl(careersUrl) {
  if (!careersUrl) return null;
  let m;
  if ((m = careersUrl.match(/boards\.greenhouse\.io\/([a-z0-9_-]+)/i)))
    return { type: "greenhouse", token: m[1] };
  if ((m = careersUrl.match(/([a-z0-9-]+)\.greenhouse\.io/i)))
    return { type: "greenhouse", token: m[1] };
  if ((m = careersUrl.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i)))
    return { type: "lever", token: m[1] };
  if ((m = careersUrl.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i)))
    return { type: "ashby", token: m[1] };
  if (/\.wd\d+\.myworkdayjobs\.com/i.test(careersUrl)) {
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
  }
  return null;
}

/* ---------------- discovery ---------------- */

async function probe(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
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
    return { type: "ashby", token: slug };
  if (await probe(`https://api.lever.co/v0/postings/${slug}?mode=json`))
    return { type: "lever", token: slug };
  return null;
}

/* ---------------- schema + seed ---------------- */

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS all_companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      domain TEXT,
      careers_url TEXT,
      ats_type TEXT,
      ats_token TEXT,
      last_fetched TEXT,
      last_error TEXT,
      last_probe TEXT,
      source TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS all_jobs (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES all_companies(id) ON DELETE CASCADE,
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_alljobs_active ON all_jobs(active)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_alljobs_company ON all_jobs(company_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_alljobs_posted ON all_jobs(posted_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_state (
      tag TEXT PRIMARY KEY,
      cursor INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);
  await pool.query(`INSERT INTO sync_state (tag, cursor, updated_at) VALUES ('all', 0, $1) ON CONFLICT (tag) DO NOTHING`, [new Date().toISOString()]);
}

async function seedCompanies(injected = null) {
  const reg = injected || JSON.parse(readFileSync(resolve(ROOT, "lib/companies-all.json"), "utf8"));
  // ATS-bearing companies first so early batches cover the best sources.
  const list = [...(reg.companies || [])].sort((a, b) => (!!b.ats) - (!!a.ats));
  for (const c of list) {
    const atsType = c.ats?.type || null;
    const atsToken = c.ats?.token || null;
    await pool.query(
      `INSERT INTO all_companies (name, domain, careers_url, ats_type, ats_token, source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         domain = COALESCE(EXCLUDED.domain, all_companies.domain),
         careers_url = COALESCE(EXCLUDED.careers_url, all_companies.careers_url),
         ats_type = COALESCE(EXCLUDED.ats_type, all_companies.ats_type),
         ats_token = COALESCE(EXCLUDED.ats_token, all_companies.ats_token)`,
      [c.name, c.domain || null, c.careersUrl || null, atsType, atsToken, c.source || "registry", new Date().toISOString()]
    );
  }
  const r = await pool.query("SELECT COUNT(*)::int AS n FROM all_companies");
  return r.rows[0].n;
}

/* ---------------- company processing ---------------- */

async function processCompany(c) {
  let ats = c.ats_type ? { type: c.ats_type, token: c.ats_token } : null;
  if (!ats) {
    const fromUrl = discoverFromUrl(c.careers_url);
    if (fromUrl) {
      ats = { type: fromUrl.type, token: fromUrl.token, site: fromUrl.site, wdInstance: fromUrl.wdInstance };
      await pool.query(
        "UPDATE all_companies SET ats_type = $1, ats_token = $2 WHERE id = $3",
        [fromUrl.type, fromUrl.token, c.id]
      );
    }
  }
  if (!ats) {
    const probedRecently = c.last_probe && Date.now() - new Date(c.last_probe).getTime() < PROBE_THROTTLE_MS;
    const alreadyFailed = (c.last_error || "").startsWith("no discoverable");
    if (!(alreadyFailed && probedRecently)) {
      ats = c.last_probe ? null : await discoverByName(c.name);
    }
    if (ats) {
      await pool.query("UPDATE all_companies SET ats_type = $1, ats_token = $2 WHERE id = $3", [ats.type, ats.token ?? null, c.id]);
    }
    await pool.query("UPDATE all_companies SET last_probe = $1 WHERE id = $2", [new Date().toISOString(), c.id]);
  }

  if (!ats) {
    await pool.query("UPDATE all_companies SET last_error = 'no discoverable ATS', last_fetched = $1 WHERE id = $2", [new Date().toISOString(), c.id]);
    return { company: c.name, jobs: 0 };
  }

  let raw = [];
  try {
    if (ats.type === "greenhouse") raw = await fetchGreenhouse(ats.token, c.name);
    else if (ats.type === "ashby") raw = await fetchAshby(ats.token, c.name);
    else if (ats.type === "lever") raw = await fetchLever(ats.token);
    else if (ats.type === "smartrecruiters") raw = await fetchSmartRecruiters(ats.token);
    else if (ats.type === "amazon") raw = await fetchAmazon();
    else if (ats.type === "workday") {
      const w = c.careers_url ? discoverFromUrl(c.careers_url) : null;
      const site = (w?.type === "workday" ? w.site : null) || (ats.token ? `${ats.token.charAt(0).toUpperCase()}${ats.token.slice(1)}Careers` : null);
      const wdInstance = w?.type === "workday" ? w.wdInstance : "1";
      if (!site) throw new Error("workday site unknown");
      raw = await fetchWorkday(ats.token, site, c.name, wdInstance);
    }
    else throw new Error(`unhandled ats ${ats.type}`);
  } catch (e) {
    await pool.query("UPDATE all_companies SET last_error = $1, last_fetched = $2 WHERE id = $3", [
      String(e.message || e).slice(0, 400),
      new Date().toISOString(),
      c.id,
    ]);
    return { company: c.name, jobs: 0, error: String(e.message || e).slice(0, 200) };
  }

  const deduped = new Map();
  const locOf = (j) =>
    typeof j.location === "string"
      ? j.location
      : typeof j.country === "string" && j.country
        ? j.country
        : j.location
          ? JSON.stringify(j.location)
          : "";
  const jobs = raw
    .filter((j) => INTERN_ROLE.test(j.title) && !EXCLUDE.test(j.title) && usOrCa(locOf(j)) && usOrCa(j.country || ""))
    .filter((j) => {
      const key = slugify(j.title);
      if (deduped.has(key)) return false;
      deduped.set(key, true);
      return true;
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 30);

  const now = new Date().toISOString();
  const activeIds = [];
  for (const j of jobs) {
    const str = locOf(j);
    const sourceId = slugify(`${c.name}-${j.title}-${str}`.slice(0, 90));
    activeIds.push(sourceId);
    const loc = normalizeLocation(str);
    await pool.query(
      `INSERT INTO all_jobs (company_id, source_id, title, location, url, posted_at, compensation, category, work_type, season, sponsorship, active, first_seen, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text, $8, $9, $10, $11, TRUE, $12, $12)
       ON CONFLICT (company_id, source_id) DO UPDATE SET
         title = EXCLUDED.title, location = EXCLUDED.location, url = EXCLUDED.url,
         posted_at = EXCLUDED.posted_at, category = EXCLUDED.category, work_type = EXCLUDED.work_type,
         season = EXCLUDED.season, sponsorship = EXCLUDED.sponsorship, active = TRUE, updated_at = EXCLUDED.updated_at`,
      [
        c.id, sourceId, j.title, loc, j.url || "#",
        j.date ? new Date(j.date).toISOString() : now, j.pay || null,
        category(j.title, c.name), workType(loc, j.meta), season(j.title), "Unknown", now,
      ]
    );
  }
  // Mark anything we didn't just see as inactive (even when a company has 0
  // matching roles); an empty list deactivates all of its old postings.
  await pool.query(
    `UPDATE all_jobs SET active = FALSE WHERE company_id = $1 AND active = TRUE AND source_id NOT IN (SELECT unnest($2::text[]))`,
    [c.id, activeIds]
  );
  await pool.query("UPDATE all_companies SET last_fetched = $1, last_error = NULL WHERE id = $2", [now, c.id]);
  return { company: c.name, jobs: jobs.length, scraped: raw.length };
}

/* ---------------- run ---------------- */

export async function runAllSync({ limit = BATCH, timeLimitMs = TIME_LIMIT_MS, registry = null } = {}) {
  const connectionString = await getEnv();
  pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await ensureSchema();
    const total = await seedCompanies(registry);

    const state = await pool.query("SELECT cursor FROM sync_state WHERE tag = 'all'");
    let cursor = state.rows[0]?.cursor || 0;

    const start = Date.now();
    let processed = 0;
    let activeJobs = 0;
    const errors = [];

    while (processed < limit && Date.now() - start < timeLimitMs) {
      const res = await pool.query(
        "SELECT * FROM all_companies WHERE id > $1 ORDER BY id LIMIT $2",
        [cursor, Math.min(limit - processed, 60)]
      );
      let rows = res.rows;
      if (rows.length === 0) {
        await pool.query("UPDATE sync_state SET cursor = 0, updated_at = $1 WHERE tag = 'all'", [new Date().toISOString()]);
        break; // wrapped — done for this pass
      }
      const companies = rows.map((r) => ({
        id: r.id,
        name: r.name,
        ats_type: r.ats_type,
        ats_token: r.ats_token,
        last_probe: r.last_probe,
        last_error: r.last_error,
      }));
      const results = await Promise.all(companies.map(processCompany));
      for (const r of results) {
        if (r.error) errors.push(`${r.company}: ${r.error}`);
        if (r.jobs > 0) activeJobs += r.jobs;
      }
      cursor = Math.max(...companies.map((c) => c.id));
      processed += companies.length;
      await pool.query("UPDATE sync_state SET cursor = $1, updated_at = $2 WHERE tag = 'all'", [cursor, new Date().toISOString()]);
    }

    const st = await pool.query("SELECT COUNT(*)::int AS n FROM all_jobs WHERE active = TRUE");
    activeJobs = st.rows[0].n;
    const ms = Date.now() - start;
    return { ok: true, processed, cursor, totalCompanies: total, jobsActive: activeJobs, elapsedMs: ms, errors: errors.slice(0, 8) };
  } finally {
    await pool.end();
  }
}

if (process.argv.includes("--run")) {
  const out = await runAllSync();
  console.log(JSON.stringify(out, null, 2));
}