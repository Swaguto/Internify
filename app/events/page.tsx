"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Radar,
  MapPin,
  Plane,
  Hotel,
  Ticket,
  ExternalLink,
  Trophy,
  Rocket,
} from "lucide-react";
import { setActiveView } from "@/lib/store";
import { ThemeToggle } from "@/components/theme-toggle";
import { CompanyLogo } from "@/components/jobs/company-logo";
import events from "@/lib/events.json";

setActiveView("alltech");

interface EventItem {
  name: string;
  type: string;
  kind: string;
  url: string;
  dateLabel: string;
  start: string | null;
  end: string | null;
  location: string;
  ticketLow: number;
  ticketHigh: number;
  ticketNote: string;
  flight: number;
  hotelPerNight: number;
  nights: number;
  notes: string;
  logoUrl?: string;
  logoFallbackUrl?: string;
  region?: string;
}

const typedEvents = events as EventItem[];

const TYPE_LABELS: Record<string, string> = {
  robotics: "Robotics",
  "ai-ml": "AI / ML",
  systems: "Systems & ENG",
  security: "Security",
  gaming: "Gaming / Graphics",
  hardware: "Hardware / Chips",
  aerospace: "Aerospace",
  quant: "Quant",
  hackathon: "Hackathons",
  competition: "Competitions",
};

const TYPE_ORDER = ["robotics", "ai-ml", "systems", "hackathon", "competition", "security", "hardware", "aerospace", "quant", "gaming"];

const REGIONS = ["US", "Canada", "Europe", "Online", "Global"];
const KINDS = ["conference", "hackathon", "competition"];
const KIND_LABELS: Record<string, string> = {
  conference: "Conferences",
  hackathon: "Hackathons",
  competition: "Competitions",
};
const BUDGETS: { value: string; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "free", label: "Free" },
  { value: "lt1k", label: "Under $1k" },
  { value: "1k2k", label: "$1k–$2k" },
  { value: "gt2k", label: "$2k+" },
];

const estTick = (e: EventItem, mid: boolean) => (mid ? (e.ticketLow + e.ticketHigh) / 2 : e.ticketLow);
const estHotel = (e: EventItem) => e.hotelPerNight * e.nights;
const estTotal = (e: EventItem, mid: boolean) => Math.round(estTick(e, mid) + estHotel(e) + e.flight);

function budgetKey(total: number) {
  if (total === 0) return "free";
  if (total < 1000) return "lt1k";
  if (total <= 2000) return "1k2k";
  return "gt2k";
}

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function FilterLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mr-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

export default function EventsPage() {
  const [type, setType] = useState<string>("all");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<string>("all");
  const [budget, setBudget] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [dated, setDated] = useState(false);
  const [sort, setSort] = useState<string>("date");

  const filtered = useMemo(() => {
    let list = typedEvents;
    if (type !== "all") list = list.filter((e) => e.type === type);
    if (region !== "all") list = list.filter((e) => e.region === region);
    if (kind !== "all") list = list.filter((e) => e.kind === kind);
    if (budget !== "all") list = list.filter((e) => budgetKey(estTotal(e, true)) === budget);
    if (dated) list = list.filter((e) => !!e.start);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(t) ||
          e.location.toLowerCase().includes(t) ||
          e.notes.toLowerCase().includes(t) ||
          e.ticketNote.toLowerCase().includes(t)
      );
    }
    return [...list].sort((a, b) => {
      if (sort === "cost") return estTotal(a, true) - estTotal(b, true);
      if (!a.start && !b.start) return 0;
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start.localeCompare(b.start);
    });
  }, [type, q, region, budget, kind, dated, sort]);

  const hasFilters =
    type !== "all" || region !== "all" || budget !== "all" || kind !== "all" || dated || q.trim() !== "";
  const freeCount = typedEvents.filter((e) => e.ticketLow === 0 && e.ticketHigh === 0).length;
  const hackathonish = typedEvents.filter((e) => e.kind === "hackathon" || e.kind === "competition").length;
  const roboticsCount = typedEvents.filter((e) => e.type === "robotics").length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Radar className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Internify</span>
            <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
              / events · conferences · hackathons
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Internships
            </Link>
            <Link
              href="/all-tech"
              className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              All Tech
            </Link>
            <span className="hidden rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground sm:inline-flex">
              Events
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6">
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Tech &amp; Robotics Events, Hackathons &amp; Competitions
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Big conferences, hidden niche events, hackathons, and student
            competitions — with location, ticket price, and a realistic
            projected trip cost (flights + hotel). All figures are approximate
            student-travel estimates in USD.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { value: `${filtered.length}`, label: "events shown" },
              { value: `${roboticsCount}`, label: "robotics events" },
              { value: `${hackathonish}`, label: "hackathons + competitions" },
              { value: `${freeCount}`, label: "free to enter" },
              { value: "est.-cost", label: "budget breakdowns" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-baseline gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5"
              >
                <span key={filtered.length} className="font-mono text-sm font-bold text-foreground tabular-nums">
                  {stat.value}
                </span>
                <span className="text-[11px] text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {["all", ...TYPE_ORDER].map((t) => (
                <Chip key={t} active={type === t} onClick={() => setType(t)}>
                  {t === "all" ? "All" : TYPE_LABELS[t]}
                </Chip>
              ))}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search events, cities, topics…"
              className="w-full rounded-md border border-border bg-card px-3 py-1.5 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary lg:w-72"
            />
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterLabel>Location</FilterLabel>
              <Chip active={region === "all"} onClick={() => setRegion("all")}>
                All
              </Chip>
              {REGIONS.map((r) => (
                <Chip key={r} active={region === r} onClick={() => setRegion(r)}>
                  {r}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterLabel>Budget (≈ total)</FilterLabel>
              {BUDGETS.map((b) => (
                <Chip key={b.value} active={budget === b.value} onClick={() => setBudget(b.value)}>
                  {b.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterLabel>Kind</FilterLabel>
              <Chip active={kind === "all"} onClick={() => setKind("all")}>
                Any
              </Chip>
              {KINDS.map((k) => (
                <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                  {KIND_LABELS[k]}
                </Chip>
              ))}
              <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
              <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={dated}
                  onChange={(e) => setDated(e.target.checked)}
                  className="accent-primary"
                />
                Dated dates only
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sort events"
                className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground outline-none focus:border-primary"
              >
                <option value="date">Sort: date</option>
                <option value="cost">Sort: cost</option>
              </select>
              {hasFilters && (
                <button
                  onClick={() => {
                    setType("all");
                    setQ("");
                    setRegion("all");
                    setBudget("all");
                    setKind("all");
                    setDated(false);
                  }}
                  className="rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-4 py-6 sm:px-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => {
            const costMid = estTotal(e, true);
            return (
              <article
                key={e.name}
                className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogo
                      name={e.name}
                      logoUrl={e.logoUrl}
                      logoFallbackUrl={e.logoFallbackUrl}
                    />
                    <h3 className="text-sm font-semibold leading-snug text-foreground">{e.name}</h3>
                  </div>
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${e.name} website`}
                    className="mt-0.5 shrink-0 rounded-md border border-border p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
                    {TYPE_LABELS[e.type]}
                  </span>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
                    {e.kind}
                  </span>
                  {e.region && (
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
                      {e.region}
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-1 text-[12px] text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    {e.dateLabel || "Dates TBA"}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    {e.location}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Ticket className="size-3.5" />
                    {e.ticketLow === 0 && e.ticketHigh === 0
                      ? "Free entry"
                      : e.ticketLow === e.ticketHigh
                        ? fmt(e.ticketLow)
                        : `${fmt(e.ticketLow)} – ${fmt(e.ticketHigh)}`}
                  </p>
                </div>

                <div className="mt-3 rounded-lg border border-border bg-muted/50 p-2.5 font-mono text-[11px] text-muted-foreground">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="flex items-center gap-1">
                      <Plane className="size-3" />
                      {e.flight ? fmt(e.flight) : "—"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Hotel className="size-3" />
                      {e.nights ? `${fmt(e.hotelPerNight)} × ${e.nights}n` : "—"}
                    </span>
                    <span className="ml-auto text-[13px] font-bold text-foreground tabular-nums">
                      ≈ {fmt(costMid)} total
                    </span>
                  </p>
                </div>

                {e.notes && (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {e.notes}
                  </p>
                )}
                {e.ticketNote && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground/70">{e.ticketNote}</p>
                )}
              </article>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center">
              <Rocket className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                No events match that filter.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border py-4 text-center text-[11px] text-muted-foreground">
        <p className="flex items-center justify-center gap-1.5">
          <Trophy className="size-3" />
          Conferences, hackathons &amp; competitions across robotics, AI, systems and more — budgets est. for a US student
        </p>
      </footer>
    </div>
  );
}