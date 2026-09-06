"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radar, Database } from "lucide-react";
import { setActiveView } from "@/lib/store";
import { JobsView } from "@/components/jobs/jobs-view";
import { ThemeToggle } from "@/components/theme-toggle";

setActiveView("alltech");

interface Stats {
  totalRoles: number;
  totalCompanies: number;
  openWeek: number;
  tracked: number;
}

export default function AllTech() {
  const [stats, setStats] = useState<Stats>({ totalRoles: 0, totalCompanies: 0, openWeek: 0, tracked: 0 });

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/jobs-all", { cache: "no-store" });
        const data = await res.json();
        const jobs = data.jobs || [];
        setStats({
          totalRoles: jobs.length,
          totalCompanies: new Set(jobs.map((j: { companyName: string }) => j.companyName)).size,
          openWeek: jobs.filter((j: { datePosted: string }) => Date.now() - new Date(j.datePosted).getTime() < 7 * 86_400_000).length,
          tracked: data.trackedCompanies || 0,
        });
      } catch {}
    }
    loadStats();
  }, []);

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
              / all · tech · robotics
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Internships
            </Link>
            <span className="hidden rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground sm:inline-flex">
              All Tech
            </span>
            <Link
              href="/events"
              className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Events
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6">
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            All Tech &amp; Robotics Internship Feed
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Every big tech, quant, AI and robotics internship we can find on public
            job boards across the US and Canada — a rolling scrape of a 2,000+
            company universe.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { value: `${stats.totalRoles}+`, label: "open roles" },
              { value: `${stats.totalCompanies}`, label: "companies hiring" },
              { value: `${stats.openWeek}`, label: "posted this week" },
              { value: `${stats.tracked}+`, label: "companies tracked" },
              { value: "rolling", label: "update cadence" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-baseline gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5"
              >
                <span className="font-mono text-sm font-bold text-foreground tabular-nums">
                  {stat.value}
                </span>
                <span className="text-[11px] text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="flex-1">
        <JobsView />
      </main>

      <footer className="border-t border-border py-4 text-center text-[11px] text-muted-foreground">
        <p className="flex items-center justify-center gap-1.5">
          <Database className="size-3" />
          Scraped from Greenhouse · Ashby · Lever · SmartRecruiters · Amazon.jobs boards via scheduled cron
        </p>
      </footer>
    </div>
  );
}