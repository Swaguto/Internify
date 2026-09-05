import { cn, monogram, monogramColor } from "@/lib/utils";

export function CompanyLogo({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card font-mono text-[11px] font-bold select-none dark:bg-secondary/60",
        className
      )}
      style={{ color: monogramColor(name) }}
    >
      {monogram(name)}
    </div>
  );
}