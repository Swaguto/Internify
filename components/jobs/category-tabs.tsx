"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/store";

export const CATEGORY_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "SWE", label: "Software Eng" },
  { value: "AI/ML", label: "AI / ML" },
  { value: "Robotics", label: "Robotics" },
  { value: "Quant", label: "Quant / Finance" },
  { value: "Systems/Infrastructure", label: "Systems & Infra" },
] as const;

export function CategoryTabs() {
  const category = useStore((s) => s.filters.category);
  const setFilter = useStore((s) => s.setFilter);

  return (
    <Tabs value={category} onValueChange={(v) => setFilter("category", v)}>
      <TabsList className="h-8 gap-1 rounded-lg border border-border bg-card px-1 text-xs">
        {CATEGORY_OPTIONS.map((c) => (
          <TabsTrigger
            key={c.value}
            value={c.value}
            className="h-6 rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {c.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}