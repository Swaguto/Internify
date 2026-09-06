import pool from "@/lib/db";
import registry from "@/lib/companies-all.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    let last: string | undefined;
    try {
      const st = await pool.query("SELECT updated_at FROM sync_state WHERE tag = 'all'");
      last = st.rows[0]?.updated_at as string | undefined;
    } catch {
      last = undefined; // schema not bootstrapped yet — proceed
    }
    if (last && Date.now() - new Date(last).getTime() < 5 * 60 * 1000) {
      return Response.json({ ok: true, skipped: "recently synced" });
    }

    const { runAllSync } = await import("../../../scripts/sync-all.mjs");
    const result = await runAllSync({ limit: 120, timeLimitMs: 50_000, registry: registry as any });
    return Response.json(result);
  } catch (error) {
    console.error("All-tech sync failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}