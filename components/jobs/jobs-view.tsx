"use client";

import { Suspense, useEffect, useMemo } from "react";
import { SearchX } from "lucide-react";
import { DEFAULT_FILTERS, applyFilters, sortJobs } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { FilterBar } from "./filter-bar";
import { JobsTable } from "./jobs-table";
import { JobCard } from "./job-card";
import { JobDetailDialog } from "./job-detail-dialog";
import { UrlSync } from "./url-sync";

export function JobsView() {
  const filters = useStore((s) => s.filters);
  const statuses = useStore((s) => s.statuses);
  const jobs = useStore((s) => s.jobs);
  const refreshJobs = useStore((s) => s.refreshJobs);
  const resetFilters = useStore((s) => s.resetFilters);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  const filtered = useMemo(
    () => sortJobs(applyFilters(jobs, filters, statuses), filters.sort),
    [jobs, filters, statuses]
  );

  const isFiltered =
    filters.q !== "" ||
    filters.category !== DEFAULT_FILTERS.category ||
    filters.location !== DEFAULT_FILTERS.location ||
    filters.company !== DEFAULT_FILTERS.company ||
    filters.sponsorshipOnly !== DEFAULT_FILTERS.sponsorshipOnly ||
    filters.dateRange !== DEFAULT_FILTERS.dateRange;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <Suspense fallback={null}>
        <UrlSync />
      </Suspense>

      <FilterBar jobs={jobs} resultCount={filtered.length} />

      {filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <SearchX className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">No matching roles</p>
            <p className="text-xs text-muted-foreground">
              Try widening your filters, or clear them to browse everything.
            </p>
          </div>
          {isFiltered && (
            <Button variant="outline" size="sm" onClick={() => resetFilters()}>
              Clear all filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-5 hidden lg:block">
            <JobsTable jobs={filtered} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:hidden">
            {filtered.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </>
      )}

      <JobDetailDialog />

      <footer className="mt-10 border-t border-border pt-4 text-[11px] text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>{jobs.length} tracked roles · updated hourly · curated from live ATS boards</span>
          <span className="font-mono">⌘K search · row click = details · bookmark = track pipeline</span>
        </p>
      </footer>
    </div>
  );
}