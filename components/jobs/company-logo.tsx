"use client";

import * as React from "react";
import { cn, monogram, monogramColor } from "@/lib/utils";

export function CompanyLogo({
  name,
  logoUrl,
  logoFallbackUrl,
  className,
}: {
  name: string;
  logoUrl?: string;
  logoFallbackUrl?: string;
  className?: string;
}) {
  // 0 = photo not attempted, 1 = showing primary, 2 = showing fallback,
  // 3 = both failed, show monogram
  const [phase, setPhase] = React.useState(logoUrl ? 1 : 3);
  const src = phase === 1 ? logoUrl : logoFallbackUrl;

  return (
    <div
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card select-none dark:bg-secondary/60",
        className
      )}
    >
      {phase < 3 ? (
        // eslint-disable-next-line @next/next/no-img-element -- favicon service, no next/image sizing available
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-contain p-0.5"
          onError={() => {
            if (phase === 1 && logoFallbackUrl) setPhase(2);
            else setPhase(3);
          }}
        />
      ) : (
        <span className="font-mono text-[11px] font-bold" style={{ color: monogramColor(name) }}>
          {monogram(name)}
        </span>
      )}
    </div>
  );
}