"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { JOBS } from "./data";
import { DEFAULT_FILTERS, type Filters } from "./utils";
import type { ApplicationStatus, Job } from "./types";

export interface StoreState {
  filters: Filters;
  selectedJobId: string | null;
  /** jobId -> Saved | Applied | Interviewing (persisted to localStorage) */
  statuses: Record<string, ApplicationStatus>;
  /** live jobs served from GET /api/jobs (falls back to the build-time dataset) */
  jobs: Job[];
  setJobs: (jobs: Job[]) => void;
  refreshJobs: () => Promise<Job[]>;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  resetFilters: () => void;
  setStatus: (jobId: string, status: ApplicationStatus | null) => void;
  clearStatuses: () => void;
  selectJob: (id: string | null) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      filters: DEFAULT_FILTERS,
      selectedJobId: null,
      statuses: {},
      jobs: JOBS,
      setJobs: (jobs: Job[]) => set({ jobs }),
      refreshJobs: async (): Promise<Job[]> => {
        try {
          const res = await fetch("/api/jobs", { cache: "no-store" });
          if (!res.ok) throw new Error(`jobs fetch ${res.status}`);
          const data = await res.json();
          const list: Job[] = Array.isArray(data.jobs) ? data.jobs : [];
          if (list.length > 0) set({ jobs: list });
          return list;
        } catch {
          return get().jobs;
        }
      },
      setFilter: (key, value) =>
        set((s) => ({ filters: { ...s.filters, [key]: value } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      setStatus: (jobId, status) =>
        set((s) => {
          const next = { ...s.statuses };
          if (status === null) delete next[jobId];
          else next[jobId] = status;
          return { statuses: next };
        }),
      clearStatuses: () => set({ statuses: {} }),
      selectJob: (id) => set({ selectedJobId: id }),
    }),
    {
      name: "internify-statuses",
      partialize: (s) => ({ statuses: s.statuses }),
    }
  )
);

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  Saved: "Saved",
  Applied: "Applied",
  Interviewing: "Interviewing",
};