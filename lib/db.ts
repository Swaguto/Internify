import { Pool } from "pg";

const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
let connectionString: string | undefined;
if (rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.searchParams.delete("channel_binding");
    connectionString = url.toString();
  } catch {
    connectionString = rawUrl;
  }
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export default pool;

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        domain TEXT,
        careers_url TEXT,
        ats_type TEXT,
        ats_token TEXT,
        track_only BOOLEAN NOT NULL DEFAULT FALSE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        last_fetched TEXT,
        last_error TEXT,
        last_probe TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT,
        url TEXT,
        posted_at TEXT,
        compensation TEXT,
        category TEXT,
        summary TEXT,
        work_type TEXT,
        season TEXT,
        sponsorship TEXT DEFAULT 'Unknown',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        first_seen TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_id, source_id)
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(active)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category)");
    await client.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_probe TEXT");
  } finally {
    client.release();
  }
}

export async function seedCompanies() {
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const ROOT = resolve(__dirname, "..");
  
  let reg: { companies?: Array<{ name: string; domain?: string; careersUrl?: string; ats?: { type: string; token?: string; slug?: string }; trackOnly?: boolean }> };
  try {
    reg = JSON.parse(readFileSync(resolve(ROOT, "lib/companies.json"), "utf8"));
  } catch {
    return;
  }
  
  for (const c of reg.companies || []) {
    const atsType = c.ats?.type || null;
    const atsToken = c.ats?.token || c.ats?.slug || null;
    await pool.query(
      `INSERT INTO companies (name, domain, careers_url, ats_type, ats_token, track_only, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         domain = COALESCE(EXCLUDED.domain, companies.domain),
         careers_url = COALESCE(EXCLUDED.careers_url, companies.careers_url),
         ats_type = COALESCE(EXCLUDED.ats_type, companies.ats_type),
         ats_token = COALESCE(EXCLUDED.ats_token, companies.ats_token),
         track_only = EXCLUDED.track_only`,
      [c.name, c.domain || null, c.careersUrl || null, atsType, atsToken, c.trackOnly || false, new Date().toISOString()]
    );
  }
}
