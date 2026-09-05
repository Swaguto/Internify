"use client";

import * as React from "react";
import {
  Bookmark,
  CalendarClock,
  CheckCircle2,
  CircleOff,
  MoreHorizontal,
  Send,
} from "lucide-react";
import { useStore, STATUS_LABELS } from "@/lib/store";
import type { ApplicationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const STATUS_STYLE: Record<
  ApplicationStatus,
  { badge: string; dot: string; icon: "bookmark" | "applied" | "interviewing" }
> = {
  Saved: { badge: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500", icon: "bookmark" },
  Applied: { badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", icon: "applied" },
  Interviewing: { badge: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400", dot: "bg-sky-500", icon: "interviewing" },
};

function StatusIcon({ status }: { status: ApplicationStatus }) {
  const Icon =
    status === "Applied" ? CheckCircle2 : status === "Interviewing" ? CalendarClock : Bookmark;
  return <Icon className="size-3.5" />;
}

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  const style = STATUS_STYLE[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 px-2 py-0.5 font-medium", style.badge, className)}>
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function StatusControl({
  jobId,
  size = "icon-sm",
  align = "end",
}: {
  jobId: string;
  size?: "icon-sm" | "icon-xs";
  align?: "center" | "start" | "end";
}) {
  const status = useStore((s) => s.statuses[jobId]);
  const setStatus = useStore((s) => s.setStatus);

  const variant =
    status === "Applied"
      ? "outline"
      : status === "Interviewing"
        ? "outline"
        : status === "Saved"
          ? "secondary"
          : "ghost";

  return (
    <DropdownMenu>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              size={size}
              variant={variant}
              className={cn(
                "border text-muted-foreground",
                status === "Saved" && "border-amber-500/50 text-amber-600 dark:text-amber-400",
                status === "Applied" && "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
                status === "Interviewing" && "border-sky-500/50 text-sky-600 dark:text-sky-400",
                !status && "border-border"
              )}
              aria-label="Application status"
            >
              <StatusIcon status={status ?? "Saved"} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {status ? `Status: ${STATUS_LABELS[status]} — click to change` : "Save / mark applied"}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align={align} className="min-w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Application status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(["Saved", "Applied", "Interviewing"] as const).map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => setStatus(jobId, s)}
            className={cn(status === s && "bg-accent font-medium")}
          >
            <StatusIcon status={s} />
            {STATUS_LABELS[s]}
            {status === s && <CheckCircle2 className="ml-auto size-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => setStatus(jobId, null)}
          className={cn(!status && "pointer-events-none opacity-50")}
        >
          <CircleOff className="size-3.5" />
          Clear status
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}