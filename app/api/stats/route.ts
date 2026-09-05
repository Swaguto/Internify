import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const companiesTotal = await pool.query("SELECT COUNT(*) as count FROM companies");
    const companiesEnabled = await pool.query("SELECT COUNT(*) as count FROM companies WHERE enabled = TRUE");
    const jobsActive = await pool.query("SELECT COUNT(*) as count FROM jobs WHERE active = TRUE");
    const lastFetch = await pool.query("SELECT MAX(last_fetched) as last FROM companies WHERE last_fetched IS NOT NULL");
    const companiesErrors = await pool.query("SELECT COUNT(*) as count FROM companies WHERE last_error IS NOT NULL");
    
    return Response.json({
      companies_total: parseInt(companiesTotal.rows[0].count),
      companies_enabled: parseInt(companiesEnabled.rows[0].count),
      jobs_active: parseInt(jobsActive.rows[0].count),
      last_fetch: lastFetch.rows[0].last,
      companies_with_errors: parseInt(companiesErrors.rows[0].count),
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return Response.json({ companies_total: 0, companies_enabled: 0, jobs_active: 0, last_fetch: null, companies_with_errors: 0 });
  }
}
