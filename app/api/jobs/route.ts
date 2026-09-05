import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = await readFile(join(process.cwd(), "lib", "jobs.json"), "utf8");
    return Response.json(JSON.parse(raw));
  } catch {
    return Response.json({ syncedAt: null, jobs: [] });
  }
}