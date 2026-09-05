import pool from "@/lib/db";
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { name?: string; careersUrl?: string; domain?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body?.name ?? "").toString().trim();
  if (!name) {
    return Response.json({ ok: false, error: "Company name is required" }, { status: 400 });
  }

  const existing = await pool.query("SELECT id, name FROM companies WHERE LOWER(name) = LOWER($1)", [name]);
  if (existing.rows.length > 0) {
    return Response.json(
      { ok: false, error: `${existing.rows[0].name} is already tracked`, name: existing.rows[0].name },
      { status: 409 }
    );
  }

  const domain = (body?.domain ?? "").toString().trim() || null;
  const careersUrl = (body?.careersUrl ?? "").toString().trim() || null;

  await pool.query(
    `INSERT INTO companies (name, domain, careers_url, track_only, created_at)
     VALUES ($1, $2, $3, FALSE, $4)`,
    [name, domain, careersUrl, new Date().toISOString()]
  );

  return Response.json({ ok: true, company: { name, domain, careersUrl } });
}
