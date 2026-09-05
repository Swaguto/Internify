"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SearchInput() {
  const q = useStore((s) => s.filters.q);
  const setFilter = useStore((s) => s.setFilter);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={q}
        onChange={(e) => setFilter("q", e.target.value)}
        placeholder="Search company, role, or keyword"
        className="h-9 pr-24 pl-9 text-sm"
        aria-label="Search jobs"
      />
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1.5">
        {q && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setFilter("q", "")}
            aria-label="Clear search"
            className="text-muted-foreground"
          >
            <X />
          </Button>
        )}
        <kbd className="pointer-events-none hidden rounded border border-border bg-secondary px-1.5 py-0.5 font-mono font-normal text-[10px] text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}