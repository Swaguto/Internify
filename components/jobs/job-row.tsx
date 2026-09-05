"use client";

import { ExternalLink, MapPin } from "lucide-react";
import type { Job, WorkType } from "@/lib/types";
import {
  cn,
  companyTag,
  timeAgo,
  type CompanyTag,
} from "@/lib/utils";
import { useStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
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

function WorkBadge({ workType }: { workType: WorkType }) {
  return (
    <Badge variant="outline" className={cn("px-1.5 font-mono text-[10px] font-normal", WORK_STYLE[workType])}>
      {workType === "On-Site" ? "On-site" : workType}
    </Badge>
  );
}

export function JobRow({ job }: { job: Job }) {
  const selectJob = useStore((s) => s.selectJob);
  const status = useStore((s) => s.statuses[job.id]);
  const tag = companyTag(job.companyName);

  return (
    <TableRow
      onClick={() => selectJob(job.id)}
      className="group cursor-pointer transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted/50"
    >
      <TableCell className="max-w-0 w-[24%]">
        <div className="flex items-center gap-2.5 pr-2">
          <CompanyLogo name={job.companyName} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <span className="truncate">{job.companyName}</span>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "mt-0.5 px-1.5 py-0 text-[10px] font-normal",
                COMPANY_TAG_STYLE[tag]
              )}
            >
              {tag}
            </Badge>
          </div>
        </div>
      </TableCell>

      <TableCell className="max-w-0 w-[34%]">
        <div className="min-w-0">
          <span className="line-clamp-1 text-[13px] font-medium text-foreground">
            {job.roleTitle}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
            {job.season}
            <span className="text-border"> · </span>
            {job.category}
          </span>
        </div>
      </TableCell>

      <TableCell className="w-[18%]">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{job.location}</span>
        </div>
        <div className="mt-1">
          <WorkBadge workType={job.workType} />
          {job.sponsorship === "Yes" ? (
            <Badge
              variant="outline"
              className="ml-1.5 border-amber-500/40 bg-amber-500/10 px-1.5 font-mono text-[10px] font-normal text-amber-700 dark:text-amber-400"
            >
              H1B
            </Badge>
          ) : null}
        </div>
      </TableCell>

      <TableCell className="w-[12%]">
        {job.compensation && job.compensation !== "Not Listed" ? (
          <span className="font-mono text-xs text-emerald-700 tabular-nums dark:text-emerald-400">
            {job.compensation}
          </span>
        ) : (
          <span className="font-mono text-xs text-muted-foreground/60">—</span>
        )}
      </TableCell>

      <TableCell className="w-[10%]">
        <time
          dateTime={job.datePosted}
          className="font-mono text-xs text-muted-foreground tabular-nums"
        >
          {timeAgo(job.datePosted)}
        </time>
      </TableCell>

      <TableCell className="w-[14%] text-right">
        <div
          className="flex items-center justify-end gap-1.5"
          onClickCapture={(e) => e.stopPropagation()}
        >
          {status && <StatusBadge status={status} className="hidden xl:inline-flex" />}
          <StatusControl jobId={job.id} />
          <Button asChild size="xs" className="px-2.5">
            <a
              href={job.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group/apply inline-flex items-center gap-1"
            >
              Apply
              <ExternalLink className="size-3 transition-transform group-hover/apply:translate-x-px group-hover/apply:-translate-y-px" />
            </a>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}