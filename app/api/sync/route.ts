import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const st = await pool.query(
      "SELECT MAX(last_fetched) as last FROM companies WHERE enabled = TRUE"
    );
    const last = st.rows[0]?.last as string | undefined;
    if (last && Date.now() - new Date(last).getTime() < 5 * 60 * 1000) {
      return Response.json({ ok: true, skipped: "recently synced" });
    }

    const { runSync } = await import("../../../scripts/sync-jobs.mjs");
    await runSync();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Sync failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}