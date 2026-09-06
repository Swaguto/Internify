import pool from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        aj.source_id AS id,
        ac.name AS "companyName",
        ac.domain AS domain,
        aj.title AS "roleTitle",
        aj.season,
        aj.location,
        aj.work_type AS "workType",
        aj.sponsorship,
        aj.posted_at AS "datePosted",
        aj.url AS "applicationUrl",
        aj.category
      FROM all_jobs aj
      JOIN all_companies ac ON ac.id = aj.company_id
      WHERE aj.active = TRUE
      ORDER BY aj.posted_at DESC NULLS LAST, aj.id DESC
      LIMIT 5000
    `);

    const jobs = result.rows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      companyLogoUrl: r.domain
        ? `https://www.google.com/s2/favicons?domain=${r.domain}&sz=64`
        : undefined,
      roleTitle: r.roleTitle,
      season: r.season || "Rolling",
      location: r.location || "",
      workType: r.workType || "On-Site",
      sponsorship: r.sponsorship || "Unknown",
      datePosted: r.datePosted || new Date().toISOString(),
      applicationUrl: r.applicationUrl || "#",
      category: r.category || "SWE",
    }));

    const st = await pool.query("SELECT COUNT(*)::int AS n FROM all_companies");
    return Response.json({
      syncedAt: new Date().toISOString(),
      trackedCompanies: st.rows[0]?.n ?? 0,
      jobs,
    });
  } catch (error) {
    console.error("Error fetching all-tech jobs:", error);
    return Response.json({ syncedAt: null, trackedCompanies: 0, jobs: [] });
  }
}