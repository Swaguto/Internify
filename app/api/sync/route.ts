import { runSync } from "@/scripts/sync-jobs.mjs";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await runSync();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Sync failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
