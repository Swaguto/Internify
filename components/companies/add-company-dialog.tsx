"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AddCompanyDialog() {
  const refreshJobs = useStore((s) => s.refreshJobs);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), careersUrl: careersUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to add company");
        return;
      }
      setSuccess(`${data.company?.name ?? name.trim()} added. Fetching internships…`);
      setName("");
      setCareersUrl("");
      setTimeout(() => refreshJobs(), 4000);
      setTimeout(() => refreshJobs(), 12000);
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Add a company to track">
          <PlusIcon />
          Add company
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Track a company</DialogTitle>
            <DialogDescription>
              Its open internship postings will be fetched automatically when a
              public ATS feed (Greenhouse / Lever / Ashby / Workday / Amazon) is
              detected.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="add-company-name">
              Company name
            </label>
            <Input
              id="add-company-name"
              required
              placeholder="e.g. Hudson River Trading"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="text-xs font-medium text-muted-foreground" htmlFor="add-company-url">
              Careers URL <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <Input
              id="add-company-url"
              placeholder="https://…/careers"
              value={careersUrl}
              onChange={(e) => setCareersUrl(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-emerald-600">{success}</p>}

          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Adding…" : "Add company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}