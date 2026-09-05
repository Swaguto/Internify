"use client";

import { ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SponsorshipToggle() {
  const sponsorshipOnly = useStore((s) => s.filters.sponsorshipOnly);
  const setFilter = useStore((s) => s.setFilter);

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <label
          className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-xs text-muted-foreground select-none hover:text-foreground"
          data-state={sponsorshipOnly ? "checked" : "unchecked"}
        >
          <Checkbox
            checked={sponsorshipOnly}
            onCheckedChange={(v) => setFilter("sponsorshipOnly", v === true)}
            aria-label="Sponsorship available only"
            className="size-3.5 rounded-[4px] border border-border data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
          />
          <ShieldCheck className="size-3.5" />
          <span>H1B / sponsorship</span>
        </label>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Only show roles where the company sponsors visas
      </TooltipContent>
    </Tooltip>
  );
}