"use client";

import { useMemo } from "react";
import { JOBS } from "@/lib/data";
import { useStore } from "@/lib/store";
import { SORT_LABELS, STATE_LABELS, stateFromLocation } from "@/lib/utils";
import { SearchInput } from "./search-input";
import { CategoryTabs } from "./category-tabs";
import { FilterSelect } from "./filter-select";
import { SponsorshipToggle } from "./sponsorship-toggle";

const DATE_OPTIONS = [
  { value: "all", label: "Any time" },
  { value: "24h", label: "Past 24 hours" },
  { value: "7d", label: "Past week" },
  { value: "30d", label: "Past month" },
];

export function FilterBar({ resultCount }: { resultCount: number }) {
  const filters = useStore((s) => s.filters);
  const setFilter = useStore((s) => s.setFilter);

  const stateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of JOBS) {
      const s = stateFromLocation(job.location);
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([abbr]) => ({
        value: abbr,
        label: STATE_LABELS[abbr] ?? abbr,
      }));
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <SearchInput />
        <span className="hidden shrink-0 font-mono text-xs text-muted-foreground tabular-nums sm:inline">
          {resultCount} role{resultCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <CategoryTabs />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={filters.location}
            onChange={(v) => setFilter("location", v)}
            placeholder="Location"
            ariaLabel="Filter by location"
            options={[
              { value: "all", label: "All locations" },
              ...(["Remote", "Hybrid", "On-Site"] as const).map((w) => ({
                value: w,
                label: w,
              })),
              ...stateOptions.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />
          <FilterSelect
            value={filters.dateRange}
            onChange={(v) => setFilter("dateRange", v)}
            placeholder="Any time"
            ariaLabel="Filter by posted date"
            options={DATE_OPTIONS}
          />
          <FilterSelect
            value={filters.sort}
            onChange={(v) => setFilter("sort", v as typeof filters.sort)}
            placeholder="Sort"
            ariaLabel="Sort jobs"
            options={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "compensation", label: SORT_LABELS.compensation },
              { value: "companyAZ", label: SORT_LABELS.companyAZ },
            ]}
          />
          <SponsorshipToggle />
        </div>
      </div>
    </div>
  );
}