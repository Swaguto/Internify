import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const REGISTRY_PATH = join(process.cwd(), "lib", "companies.json");

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

async function loadRegistry() {
  try {
    return JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
  } catch {
    return { version: 1, companies: [] };
  }
}

export async function POST(request: NextRequest) {
  let body: { name?: string; careersUrl?: string; domain?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body?.name ?? "").toString().trim();
  if (!name) {
    return Response.json({ ok: false, error: "Company name is required" }, { status: 400 });
  }

  const registry = await loadRegistry();
  const companies = registry.companies ?? [];

  const existing = companies.find((c: { name: string }) => norm(c.name) === norm(name));
  if (existing) {
    return Response.json(
      { ok: false, error: `${existing.name} is already tracked`, name: existing.name },
      { status: 409 }
    );
  }

  const entry = {
    name,
    domain: (body?.domain ?? "").toString().trim() || null,
    careersUrl: (body?.careersUrl ?? "").toString().trim() || null,
    ats: null,
    trackOnly: false,
    addedAt: new Date().toISOString(),
  };
  companies.push(entry);
  await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n", "utf8");

  void (async () => {
    try {
      const { runSync } = await import("../../../scripts/sync-jobs.mjs");
      await runSync();
    } catch {
      // sync is best-effort; the registry write already succeeded
    }
  })();

  return Response.json({ ok: true, company: entry });
}