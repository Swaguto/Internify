import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [totalRes, enabledRes, activeRes, lastRes, errorsRes] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM companies"),
      pool.query("SELECT COUNT(*) as count FROM companies WHERE enabled = TRUE"),
      pool.query("SELECT COUNT(*) as count FROM jobs WHERE active = TRUE"),
      pool.query("SELECT MAX(last_fetched) as last FROM companies WHERE last_fetched IS NOT NULL"),
      pool.query("SELECT COUNT(*) as count FROM companies WHERE last_error IS NOT NULL"),
    ]);
    
    return Response.json({
      companies_total: Number(totalRes.rows[0].count),
      companies_enabled: Number(enabledRes.rows[0].count),
      jobs_active: Number(activeRes.rows[0].count),
      last_fetch: lastRes.rows[0].last,
      companies_with_errors: Number(errorsRes.rows[0].count),
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return Response.json({ companies_total: 0, companies_enabled: 0, jobs_active: 0, last_fetch: null, companies_with_errors: 0 });
  }
}
