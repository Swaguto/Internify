"use client";

import { useEffect, useState } from "react";
import { Radar } from "lucide-react";
import { companyTag } from "@/lib/utils";
import { JobsView } from "@/components/jobs/jobs-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { AddCompanyDialog } from "@/components/companies/add-company-dialog";

interface Stats {
  totalRoles: number;
  totalCompanies: number;
  openWeek: number;
  tags: number;
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({ totalRoles: 0, totalCompanies: 0, openWeek: 0, tags: 0 });

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        const data = await res.json();
        const jobs = data.jobs || [];
        setStats({
          totalRoles: jobs.length,
          totalCompanies: new Set(jobs.map((j: { companyName: string }) => j.companyName)).size,
          openWeek: jobs.filter((j: { datePosted: string }) => Date.now() - new Date(j.datePosted).getTime() < 7 * 86_400_000).length,
          tags: new Set(jobs.map((j: { companyName: string }) => companyTag(j.companyName))).size,
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
              / us · swe · internships
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              live
            </span>
            <AddCompanyDialog />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6">
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            US Software Engineering Internship Tracker
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            A curated, filterable feed of software internships across Big Tech,
            quant funds, AI labs and startups — searchable, sortable by pay, and
            tracked through to offer.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { value: `${stats.totalRoles}+`, label: "open roles" },
              { value: `${stats.totalCompanies}`, label: "companies" },
              { value: `${stats.tags}`, label: "company types" },
              { value: `${stats.openWeek}`, label: "posted this week" },
              { value: "hourly", label: "update cadence" },
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
    </div>
  );
}
