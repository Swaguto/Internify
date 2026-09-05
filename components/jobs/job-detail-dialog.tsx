"use client";

import { useMemo } from "react";
import {
  Banknote,
  CalendarDays,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, companyTag, timeAgo, WORK_LABELS, type CompanyTag } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompanyLogo } from "./company-logo";
import { StatusBadge, StatusControl } from "./status-control";

const COMPANY_TAG_STYLE: Record<CompanyTag, string> = {
  "Big Tech": "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  Quant: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "AI Lab": "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  Startup: "border-border bg-secondary text-muted-foreground",
};

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex w-6 items-center justify-center text-muted-foreground [&>svg]:size-4">
        {icon}
      </span>
      <dt className="w-32 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{value}</dd>
    </div>
  );
}

export function JobDetailDialog() {
  const selectedJobId = useStore((s) => s.selectedJobId);
  const selectJob = useStore((s) => s.selectJob);
  const jobs = useStore((s) => s.jobs);
  const status = useStore((s) =>
    s.selectedJobId ? s.statuses[s.selectedJobId] : undefined
  );

  const job = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? null,
    [selectedJobId, jobs]
  );

  return (
    <Dialog open={!!job} onOpenChange={(open) => !open && selectJob(null)}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        {job && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4">
              <div className="flex w-full items-center gap-3">
                <CompanyLogo name={job.companyName} logoUrl={job.companyLogoUrl} className="size-9 text-xs" />
                <div className="min-w-0">
                  <DialogTitle className="text-[15px] leading-tight">
                    {job.companyName}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px]">
                    <Badge
                      variant="outline"
                      className={cn(
                        "px-1.5 py-0 text-[10px] font-normal",
                        COMPANY_TAG_STYLE[companyTag(job.companyName)]
                      )}
                    >
                      {companyTag(job.companyName)}
                    </Badge>
                    {job.season}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="px-5 py-2">
              <h2 className="pt-1 text-lg leading-snug font-semibold">
                {job.roleTitle}
              </h2>

              <dl className="divide-y divide-border">
                <MetaRow icon={<MapPin />} label="Location" value={<span>{job.location}</span>} />
                <MetaRow
                  icon={<Workflow />}
                  label="Work type"
                  value={<Badge variant="secondary" className="font-mono text-[11px]">{WORK_LABELS[job.workType]}</Badge>}
                />
                <MetaRow
                  icon={<Banknote />}
                  label="Compensation"
                  value={
                    job.compensation && job.compensation !== "Not Listed" ? (
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {job.compensation}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not listed</span>
                    )
                  }
                />
                <MetaRow
                  icon={<ShieldCheck />}
                  label="Sponsorship"
                  value={
                    job.sponsorship === "Yes" ? (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">Available</span>
                    ) : job.sponsorship === "No" ? (
                      <span className="text-destructive">Not offered</span>
                    ) : (
                      <span className="text-muted-foreground">Unknown</span>
                    )
                  }
                />
                <MetaRow
                  icon={<CalendarDays />}
                  label="Posted"
                  value={
                    <time dateTime={job.datePosted} className="font-mono text-xs text-muted-foreground tabular-nums">
                      {timeAgo(job.datePosted)} ·{" "}
                      {new Date(job.datePosted).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                  }
                />
              </dl>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <StatusControl jobId={job.id} />
                {status && <StatusBadge status={status} />}
              </div>
              <Button asChild className="inline-flex items-center gap-1.5">
                <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer">
                  Apply externally
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}