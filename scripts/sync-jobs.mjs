import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

async function get(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, "content-type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
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
  const intern = /intern|undergrad|university|graduate|new grad|early career/i;
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
  const intern = /intern|undergrad|university|graduate|new grad|early career/i;
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

/* ---------- source: amazon ---------- */
async function fetchAmazon() {
  const queries = [
    "software%20development%20engineer%20intern",
    "software%20engineer%20intern",
    "applied%20scientist%20intern",
    "machine%20learning%20intern",
  ];
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    for (let page = 1; page <= 2; page++) {
      let data;
      try {
        data = await get(
          `https://www.amazon.jobs/en/search.json?base_query=${q}&country%5B%5D=USA&page=${page}&sort=recent`
        );
      } catch {
        break;
      }
      for (const j of data.jobs || []) {
        if (j.country_code !== "USA") continue;
        if (!j.is_intern && !/intern/i.test(j.title)) continue;
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
  }
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
  const out = [];
  for (let offset = 0; offset <= 180; offset += 20) {
    const raw = await fetch(
      "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs",
      {
        method: "POST",
        headers: { "content-type": "application/json", "User-Agent": UA },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "intern" }),
      }
    );
    let data = {};
    try { data = await raw.json(); } catch { break; }
    for (const j of data.jobPostings || []) {
      if (!/intern/i.test(j.title)) continue;
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

/* ---------- ats discovery ---------- */
function discoverFromUrl(careersUrl, _name) {
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
  if (/\.wd\d+\.myworkdayjobs\.com/i.test(careersUrl) || /nvidia|workday/i.test(careersUrl))
    return { type: "nvidia" };
  return null;
}

async function discoverByName(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`,
      { headers: { "user-agent": UA } }
    );
    if (res.ok) return { type: "greenhouse", token: slug };
  } catch {}
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
      headers: { "user-agent": UA },
    });
    if (res.ok) return { type: "ashby", slug };
  } catch {}
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
      headers: { "user-agent": UA },
    });
    if (res.ok) return { type: "lever", slug };
  } catch {}
  if (/amazon/i.test(name)) return { type: "amazon" };
  if (/nvidia/i.test(name)) return { type: "nvidia" };
  return null;
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

const favicon = (domain) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

const EXCLUDE =
  /\b(recruit(?:er|ing)?|talent|human resources|\bhr\b|marketing|sales(?:person| rep| associate)?|content (?:design(?:er)?|writer)|program manager|product manag(?:er|ement)|technical program manager|business (?:development|analyst)|associate product manager|customer experience|support (?:specialist|associate)|operations (?:manager|planning)|ux researcher|product design|\bdesign(?:er)?\b|\bdesign intern|people (?:ops|team)|public policy|legal|accounting|brand|communications|social media|community|strategist|careers (?:specialist|coordinator)|early careers & (?:interns )?(?:specialist|coordinator)|interns specialist)\b/i;

const NON_US =
  /\b(canada|united kingdom|\buk\b|london|toronto|waterloo|zurich|berlin|paris|dublin|amsterdam|singapore|india|mexico|sao paulo|tel aviv|israel|japan|tokyo|beijing|shanghai|sydney|hong kong|munich|stockholm|oslo|copenhagen|sweden|netherlands|switzerland|ireland|germany|france|barcelona|madrid|australia)\b/i;
const US_MARKER = /\b(united states|\busa\b|, [A-Z]{2}\b|california|washington|new york|texas|massachusetts|illinois|colorado|virginia|north carolina|oregon)\b/i;

function category(title) {
  const t = title.toLowerCase();
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

/* ---------- location normalizer + emitters ---------- */
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

function writeDataTs(jobs) {
  const esc = (v) => JSON.stringify(v);
  const lines = [];
  lines.push('import type { Job } from "./types";');
  lines.push("");
  lines.push("export const JOBS: Job[] = [");
  for (const j of jobs) {
    lines.push("  {");
    lines.push(`    id: ${esc(j.id)},`);
    lines.push(`    companyName: ${esc(j.companyName)},`);
    lines.push(`    companyLogoUrl: ${esc(j.companyLogoUrl)},`);
    lines.push(`    roleTitle: ${esc(j.roleTitle)},`);
    lines.push(`    season: ${esc(j.season)},`);
    lines.push(`    location: ${esc(j.location)},`);
    lines.push(`    workType: ${esc(j.workType)},`);
    lines.push(`    sponsorship: ${esc(j.sponsorship)},`);
    lines.push(`    datePosted: ${esc(j.datePosted)},`);
    lines.push(`    applicationUrl: ${esc(j.applicationUrl)},`);
    lines.push(`    category: ${esc(j.category)},`);
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");
  writeFileSync(resolve(ROOT, "lib/data.ts"), lines.join("\n"));
}

/* ---------- run ---------- */
export async function runSync() {
  let reg;
  try {
    reg = JSON.parse(readFileSync(resolve(ROOT, "lib/companies.json"), "utf8"));
  } catch {
    console.error("lib/companies.json not found");
    process.exitCode = 1;
    return;
  }
  const companies = reg.companies || [];
  const domains = new Map(
    companies.filter((c) => c.domain).map((c) => [c.name.toLowerCase(), c.domain])
  );

  const results = [];
  const failed = [];
  for (const c of companies) {
    if (c.trackOnly) continue;
    let ats = c.ats;
    if (!ats) {
      ats = discoverFromUrl(c.careersUrl, c.name) || (await discoverByName(c.name));
    }
    if (!ats) {
      failed.push(`${c.name} (no discoverable ATS)`);
      continue;
    }
    try {
      if (ats.type === "amazon") results.push(...(await fetchAmazon()));
      else if (ats.type === "nvidia") results.push(...(await fetchNvidia()));
      else {
        const fetcher =
          ats.type === "greenhouse" ? fetchGreenhouse : ats.type === "lever" ? fetchLever : ats.type === "ashby" ? fetchAshby : null;
        if (!fetcher) throw new Error(`unknown ats ${ats.type}`);
        const key = ats.type === "greenhouse" ? ats.token : ats.slug;
        results.push(...(await fetcher(key, c.name)));
      }
    } catch {
      failed.push(c.name);
    }
  }

  const perCompany = new Map();
  for (const r of results) {
    if (!perCompany.has(r.company)) perCompany.set(r.company, []);
    perCompany.get(r.company).push(r);
  }

  const jobs = [];
  const usedIds = new Set();
  for (const [company, rows] of perCompany) {
    const seen = new Set();
    const uniq = rows.filter((r) => {
      const k = r.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    for (const r of uniq.slice(0, 4)) {
      if (EXCLUDE.test(r.title)) continue;
      if (NON_US.test(r.location) && !US_MARKER.test(r.location)) continue;
      let n = 1;
      let id = slugify(`${company}-${r.title}`);
      while (usedIds.has(id)) id = `${slugify(company)}-${n++}`;
      usedIds.add(id);
      jobs.push({
        id,
        companyName: company,
        companyLogoUrl: favicon(domains.get(company.toLowerCase()) || DOMAIN(company)),
        roleTitle: r.title,
        season: season(r.title),
        location: normalizeLocation(r.location),
        workType: workType(r.location, r.meta),
        sponsorship: "Unknown",
        datePosted: r.updated_at,
        applicationUrl: r.url,
        category: category(r.title),
      });
    }
  }
  jobs.sort((a, b) => new Date(b.datePosted) - new Date(a.datePosted));

  writeDataTs(jobs);
  writeFileSync(
    resolve(ROOT, "lib/jobs.json"),
    JSON.stringify({ syncedAt: new Date().toISOString(), jobs }, null, 2) + "\n",
    "utf8"
  );

  const byCo = {};
  for (const j of jobs) byCo[j.companyName] = (byCo[j.companyName] || 0) + 1;
  console.log(
    `fetched ${results.length} raw candidates -> ${jobs.length} real jobs across ${new Set(jobs.map((j) => j.companyName)).size} companies`
  );
  console.log(JSON.stringify(byCo, null, 0));
  if (failed.length) console.log("no results for:", failed.join(", "));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSync();
}