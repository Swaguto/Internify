"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { DEFAULT_FILTERS, type Filters } from "@/lib/utils";

function parseFilters(sp: URLSearchParams): Partial<Filters> {
  const next: Partial<Filters> = {};
  const q = sp.get("q");
  if (q) next.q = q;
  const cat = sp.get("cat");
  if (cat) next.category = cat;
  const loc = sp.get("loc");
  if (loc) next.location = loc;
  if (sp.get("spon") === "1") next.sponsorshipOnly = true;
  const range = sp.get("range");
  if (range) next.dateRange = range;
  const sort = sp.get("sort") as Filters["sort"];
  if (sort) next.sort = sort;
  return next;
}

/**
 * Reads filters from the URL on first mount, then mirrors store
 * changes back into the URL (debounced) so views are shareable/bookmarkable.
 */
export function UrlSync() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useStore((s) => s.filters);
  const hydrated = useRef(false);

  // hydrate once from URL
  useEffect(() => {
    if (hydrated.current) return;
    const next = parseFilters(searchParams);
    if (Object.keys(next).length > 0) {
      useStore.setState((s) => ({ filters: { ...DEFAULT_FILTERS, ...next } }));
    }
    hydrated.current = true;
  }, [searchParams]);

  // mirror store -> URL (debounced, replace to avoid history spam)
  useEffect(() => {
    if (!hydrated.current) return;
    const f = useStore.getState().filters;
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.category !== DEFAULT_FILTERS.category) params.set("cat", f.category);
    if (f.location !== DEFAULT_FILTERS.location) params.set("loc", f.location);
    if (f.sponsorshipOnly) params.set("spon", "1");
    if (f.dateRange !== DEFAULT_FILTERS.dateRange) params.set("range", f.dateRange);
    if (f.sort !== DEFAULT_FILTERS.sort) params.set("sort", f.sort);
    const target = params.size ? `${pathname}?${params.toString()}` : pathname;
    const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (target === current) return;
    const t = setTimeout(() => router.replace(target, { scroll: false }), 250);
    return () => clearTimeout(t);
  }, [filters, pathname, router, searchParams]);

  return null;
}