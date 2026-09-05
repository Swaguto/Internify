"use client";

import type { Job } from "@/lib/types";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobRow } from "./job-row";

export function JobsTable({ jobs }: { jobs: Job[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[24%] py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Company
            </TableHead>
            <TableHead className="w-[34%] py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Role
            </TableHead>
            <TableHead className="w-[18%] py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Location
            </TableHead>
            <TableHead className="w-[12%] py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Pay
            </TableHead>
            <TableHead className="w-[10%] py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Posted
            </TableHead>
            <TableHead className="w-[14%] py-2.5 pr-5 text-right text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}