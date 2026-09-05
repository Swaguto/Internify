import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REGISTRY_PATH = resolve(ROOT, "lib/companies.json");

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const HEADER_ALIASES = {
  name: ["name", "company", "companyname", "company name"],
  careersUrl: ["careersurl", "careers url", "careers", "url", "careersurl url", "careerspage"],
  domain: ["domain", "domainname", "website"],
  atsType: ["atstype", "ats", "ats type", "system"],
  atsKey: ["atskey", "token", "slug", "board", "ats token", "ats slug"],
};

function pick(header, row, aliases) {
  for (const a of aliases) {
    const idx = header.findIndex((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === a);
    if (idx !== -1 && (row[idx] ?? "").trim() !== "") return row[idx].trim();
  }
  return "";
}

function toAts(atsType, atsKey) {
  const t = (atsType || "").toLowerCase();
  if (!t) return null;
  if (/greenhouse|gh/i.test(t) && atsKey) return { type: "greenhouse", token: atsKey };
  if (/lever/i.test(t) && atsKey) return { type: "lever", slug: atsKey };
  if (/ashby/i.test(t) && atsKey) return { type: "ashby", slug: atsKey };
  if (/amazon/i.test(t) && !atsKey) return { type: "amazon" };
  if (/workday|nvidia/i.test(t) && !atsKey) return { type: "nvidia" };
  return null;
}

const [csvPath] = process.argv.slice(2);
if (!csvPath) {
  console.error("Usage: node scripts/ingest-companies.mjs <companies.csv>");
  process.exit(1);
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
if (rows.length < 2) {
  console.error("CSV has no data rows");
  process.exit(1);
}
const header = rows[0].map((h) => h.trim());
const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
const companies = registry.companies ?? [];

let added = 0;
let updated = 0;
for (const row of rows.slice(1)) {
  const name = pick(header, row, HEADER_ALIASES.name);
  if (!name) continue;
  const careersUrl = pick(header, row, HEADER_ALIASES.careersUrl);
  const domain = pick(header, row, HEADER_ALIASES.domain);
  const ats = toAts(pick(header, row, HEADER_ALIASES.atsType), pick(header, row, HEADER_ALIASES.atsKey));
  const existing = companies.find((c) => norm(c.name) === norm(name));
  if (existing) {
    if (ats && !existing.ats) existing.ats = ats;
    if (careersUrl && !existing.careersUrl) existing.careersUrl = careersUrl;
    if (domain && !existing.domain) existing.domain = domain;
    if (existing.trackOnly === true && ats) existing.trackOnly = false;
    updated++;
  } else {
    companies.push({
      name,
      domain: domain || null,
      careersUrl: careersUrl || null,
      ats,
      trackOnly: !ats,
      addedAt: new Date().toISOString(),
    });
    added++;
  }
}

registry.companies = companies;
writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n", "utf8");
console.log(`ingested ${rows.length - 1} rows -> ${added} added, ${updated} updated (registry now ${companies.length} companies)`);
console.log("run `npm run sync:jobs` to refresh postings (or I can do it next).");