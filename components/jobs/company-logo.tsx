"use client";

import * as React from "react";
import { cn, monogram, monogramColor } from "@/lib/utils";

export function CompanyLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl?: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const showImg = Boolean(logoUrl) && !failed;

  return (
    <div
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card select-none dark:bg-secondary/60",
        className
      )}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- favicon service, no next/image sizing available
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          className="size-full object-contain p-0.5"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-mono text-[11px] font-bold" style={{ color: monogramColor(name) }}>
          {monogram(name)}
        </span>
      )}
    </div>
  );
}