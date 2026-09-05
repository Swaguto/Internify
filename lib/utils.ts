import type { Job, SortKey } from "./types";

export { cn } from "cn";

/* ---------- relative time ---------- */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < MIN) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  const days = Math.floor(diff / DAY);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

/* ---------- compensation ---------- */

const MONTHLY_RE = /([\d,.]+)\s*(k)?\/mo/i;
const HOURLY_RE = /([\d,.]+)\s*(?:-|\u2013)\s*([\d,.]+)\/hr/i;

/** Best-effort numeric sort key for compensation (monthly-equivalent). */
export function compensationValue(comp?: string): number {
  if (!comp || comp === "Not Listed") return 0;
  const hr = comp.match(HOURLY_RE);
  if (hr) {
    const low = parseFloat(hr[1].replace(/,/g, ""));
    const high = parseFloat(hr[2].replace(/,/g, ""));
    const mid = (low + high) / 2;
    return mid * 160; // ~160 billable hours / month
  }
  const mo = comp.match(MONTHLY_RE);
  if (mo) {
    let value = parseFloat(mo[1].replace(/,/g, ""));
    if (mo[2]) value *= 1000;
    return value;
  }
  return 0;
}

export function monogram(name: string): string {
  const words = name.replace(/[^\w\s-]/g, "").split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function monogramColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 62% 46%)`;
}

/* ---------- location helpers ---------- */

const STATE_RE = /\b([A-Z]{2})\b\s*$/;

export function stateFromLocation(location: string): string | null {
  const m = location.match(STATE_RE);
  return m ? m[1] : null;
}

export const STATE_LABELS: Record<string, string> = {
  CA: "California",
  WA: "Washington",
  NY: "New York",
  MA: "Massachusetts",
  IL: "Illinois",
  TX: "Texas",
  GA: "Georgia",
  OR: "Oregon",
  CO: "Colorado",
  VA: "Virginia",
  DC: "Washington DC",
};

export const WORK_LABELS: Record<string, string> = {
  Remote: "Remote",
  "On-Site": "On-site",
  Hybrid: "Hybrid",
};

/* ---------- filtering & sorting ---------- */

export interface Filters {
  q: string;
  category: string; // "all" | Category
  location: string; // "all" | WorkType | State abbr
  company: string; // "all" | exact company name
  sponsorshipOnly: boolean;
  dateRange: string; // "all" | "24h" | "7d" | "30d"
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  q: "",
  category: "all",
  location: "all",
  company: "all",
  sponsorshipOnly: false,
  dateRange: "all",
  sort: "newest",
};

const DATE_CUTOFF: Record<string, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

export function applyFilters(jobs: Job[], f: Filters, statuses: Record<string, string>, now = Date.now()): Job[] {
  const q = f.q.trim().toLowerCase();
  const cutoff = DATE_CUTOFF[f.dateRange];

  return jobs.filter((job) => {
    if (f.category !== "all" && job.category !== f.category) return false;
    if (f.company !== "all" && job.companyName !== f.company) return false;
    if (f.sponsorshipOnly && job.sponsorship !== "Yes") return false;

    if (f.location !== "all") {
      if (f.location === "Remote" || f.location === "On-Site" || f.location === "Hybrid") {
        if (job.workType !== f.location) return false;
      } else if (stateFromLocation(job.location) !== f.location) {
        return false;
      }
    }

    if (cutoff && now - new Date(job.datePosted).getTime() > cutoff) return false;

    if (q) {
      const haystack = [
        job.companyName,
        job.roleTitle,
        job.season,
        job.category,
        job.location,
        WORK_LABELS[job.workType] ?? "",
        job.compensation ?? "",
        statuses[job.id] ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function sortJobs(jobs: Job[], sort: SortKey): Job[] {
  const sorted = [...jobs];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => +new Date(b.datePosted) - +new Date(a.datePosted));
    case "oldest":
      return sorted.sort((a, b) => +new Date(a.datePosted) - +new Date(b.datePosted));
    case "companyAZ":
      return sorted.sort((a, b) => a.companyName.localeCompare(b.companyName));
    case "compensation":
      return sorted.sort((a, b) => compensationValue(b.compensation) - compensationValue(a.compensation));
  }
  return sorted;
}

export const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  companyAZ: "Company A–Z",
  compensation: "Highest pay",
};

/* ---------- company-type tags ---------- */

const BIG_TECH = new Set([
  "Amazon",
  "Apple",
  "Google",
  "Meta",
  "Microsoft",
  "Tesla",
  "Netflix",
  "NVIDIA",
  "Uber",
]);

const QUANT_FIRMS = new Set([
  "Citadel",
  "Jump Trading",
  "Hudson River Trading",
  "Optiver",
  "IMC Trading",
  "D. E. Shaw",
  "Akuna Capital",
  "Squarepoint Capital",
  "Goldman Sachs",
  "Kanza Research",
]);

const AI_LABS = new Set(["OpenAI", "Anthropic", "Scale AI", "Cohere"]);

export type CompanyTag = "Big Tech" | "Quant" | "AI Lab" | "Startup";

export function companyTag(name: string): CompanyTag {
  if (BIG_TECH.has(name)) return "Big Tech";
  if (QUANT_FIRMS.has(name)) return "Quant";
  if (AI_LABS.has(name)) return "AI Lab";
  return "Startup";
}