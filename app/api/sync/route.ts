export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { runSync } = await import("../../../scripts/sync-jobs.mjs");
    await runSync();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Sync failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
