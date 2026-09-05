import pool from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        j.id,
        j.source_id as "id",
        c.name as "companyName",
        c.domain as "companyLogoUrl",
        j.title as "roleTitle",
        j.season,
        j.location,
        j.work_type as "workType",
        j.sponsorship,
        j.posted_at as "datePosted",
        j.url as "applicationUrl",
        j.category
      FROM jobs j
      JOIN companies c ON c.id = j.company_id
      WHERE j.active = TRUE AND c.enabled = TRUE
      ORDER BY j.posted_at DESC NULLS LAST, j.id DESC
    `);
    
    const jobs = result.rows.map((r) => ({
      ...r,
      companyLogoUrl: r.companyLogoUrl
        ? `https://www.google.com/s2/favicons?domain=${r.companyLogoUrl}&sz=64`
        : undefined,
    }));
    
    return Response.json({ syncedAt: new Date().toISOString(), jobs });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return Response.json({ syncedAt: null, jobs: [] });
  }
}
