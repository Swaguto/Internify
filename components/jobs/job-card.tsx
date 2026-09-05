"use client";

import { ExternalLink, MapPin } from "lucide-react";
import type { Job, WorkType } from "@/lib/types";
import { cn, companyTag, timeAgo, type CompanyTag } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "./company-logo";
import { StatusBadge, StatusControl } from "./status-control";

const COMPANY_TAG_STYLE: Record<CompanyTag, string> = {
  "Big Tech": "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  Quant: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "AI Lab": "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  Startup: "border-border bg-secondary text-muted-foreground",
};

const WORK_STYLE: Record<WorkType, string> = {
  Remote: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Hybrid: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  "On-Site": "border-border bg-secondary text-muted-foreground",
};

export function JobCard({ job }: { job: Job }) {
  const selectJob = useStore((s) => s.selectJob);
  const status = useStore((s) => s.statuses[job.id]);
  const tag = companyTag(job.companyName);

  return (
    <article
      onClick={() => selectJob(job.id)}
      className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <CompanyLogo name={job.companyName} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{job.companyName}</p>
            <Badge variant="outline" className={cn("mt-0.5 px-1.5 py-0 text-[10px] font-normal", COMPANY_TAG_STYLE[tag])}>
              {tag}
            </Badge>
          </div>
        </div>
        <time dateTime={job.datePosted} className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
          {timeAgo(job.datePosted)}
        </time>
      </div>

      <div>
        <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold text-foreground">
          {job.roleTitle}
        </h3>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {job.season} · {job.category}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={cn("px-1.5 font-mono text-[10px] font-normal", WORK_STYLE[job.workType])}>
          {job.workType === "On-Site" ? "On-site" : job.workType}
        </Badge>
        <Badge variant="outline" className="px-1.5 font-mono text-[10px] font-normal text-muted-foreground">
          {job.sponsorship === "Yes" ? "H1B ✓" : job.sponsorship}
        </Badge>
        {job.compensation && job.compensation !== "Not Listed" && (
          <Badge variant="outline" className="px-1.5 font-mono text-[10px] font-normal text-emerald-700 dark:text-emerald-400">
            {job.compensation}
          </Badge>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3.5" />
        <span className="truncate">{job.location}</span>
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          {status && <StatusBadge status={status} />}
        </div>
        <div className="flex items-center gap-1.5" onClickCapture={(e) => e.stopPropagation()}>
          <StatusControl jobId={job.id} size="icon-xs" />
          <Button asChild size="sm">
            <a
              href={job.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1"
            >
              Apply
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}