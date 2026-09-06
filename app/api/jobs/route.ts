import pool from "@/lib/db";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export async function GET() {
  try {
    const st = await pool.query(
      "SELECT MAX(last_fetched) as last FROM companies WHERE enabled = TRUE"
    );
    const last = st.rows[0]?.last as string | undefined;
    const stale = !last || Date.now() - new Date(last).getTime() > STALE_AFTER_MS;

    if (stale) {
      after(async () => {
        try {
          const { runSync } = await import("../../../scripts/sync-jobs.mjs");
          await runSync();
          console.log("stale refresh completed");
        } catch (e) {
          console.error("stale refresh failed:", e);
        }
      });
    }

    const result = await pool.query(`
      SELECT 
        j.id,
        j.source_id as "id",
        c.name as "companyName",
        c.domain as "domain",
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
      id: r.id,
      companyName: r.companyName,
      ...(r.domain
        ? {
            companyLogoUrl: `https://icons.duckduckgo.com/ip3/${r.domain}.ico`,
            companyLogoFallbackUrl: `https://www.google.com/s2/favicons?domain=${r.domain}&sz=64`,
          }
        : { companyLogoUrl: undefined, companyLogoFallbackUrl: undefined }),
      roleTitle: r.roleTitle,
      season: r.season || "Rolling",
      location: r.location || "",
      workType: r.workType || "On-Site",
      sponsorship: r.sponsorship || "Unknown",
      datePosted: r.datePosted || new Date().toISOString(),
      applicationUrl: r.applicationUrl || "#",
      category: r.category || "SWE",
    }));

    return Response.json({ syncedAt: new Date().toISOString(), jobs });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return Response.json({ syncedAt: null, jobs: [] });
  }
}