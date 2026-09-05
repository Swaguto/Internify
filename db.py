import os
import re
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

_INTERN_RE = re.compile(r"\b(interns?|internships?|co-?ops?|fellowships?)\b", re.IGNORECASE)

DB_URL = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("POSTGRES_URL_NON_POOLING")
    or os.environ.get("POSTGRES_URL")
)


def _now():
    return datetime.now(timezone.utc).isoformat()


def connect():
    if not DB_URL:
        raise RuntimeError(
            "no Postgres connection string set — configure DATABASE_URL / POSTGRES_URL in your environment"
        )
    conn = psycopg.connect(DB_URL, row_factory=dict_row)
    conn.autocommit = True
    return conn


def init_db():
    conn = connect()
    try:
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                board_type TEXT NOT NULL,
                board_key TEXT NOT NULL,
                domain TEXT,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                last_fetched TEXT,
                last_error TEXT,
                created_at TEXT NOT NULL
            )
            """,
            """
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
                active BOOLEAN NOT NULL DEFAULT TRUE,
                first_seen TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(company_id, source_id)
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(active)",
            "CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id)",
            "CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs(posted_at)",
        ):
            conn.execute(stmt)
    finally:
        conn.close()


def upsert_company(name, board_type, board_key, domain=None):
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO companies (name, board_type, board_key, domain, enabled, created_at)
            VALUES (%s, %s, %s, %s, TRUE, %s)
            ON CONFLICT (name) DO UPDATE SET
                board_type = EXCLUDED.board_type,
                board_key = EXCLUDED.board_key,
                domain = COALESCE(EXCLUDED.domain, companies.domain),
                enabled = TRUE
            """,
            (name, board_type, board_key, domain, _now()),
        )
    finally:
        conn.close()


def list_companies():
    conn = connect()
    try:
        rows = conn.execute(
            """
            SELECT c.*, COUNT(j.id) AS job_count
            FROM companies c
            LEFT JOIN jobs j ON j.company_id = c.id AND j.active = TRUE
            GROUP BY c.id
            ORDER BY c.name
            """
        ).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


def get_company(company_id):
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM companies WHERE id = %s", (company_id,)).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None


def set_company_meta(company_id, enabled=None, domain=None):
    sets, params = [], []
    if enabled is not None:
        sets.append("enabled = %s")
        params.append(bool(enabled))
    if domain is not None:
        sets.append("domain = %s")
        params.append(domain or None)
    if not sets:
        return
    conn = connect()
    try:
        conn.execute(f"UPDATE companies SET {', '.join(sets)} WHERE id = %s", (*params, company_id))
    finally:
        conn.close()


def delete_company(company_id):
    conn = connect()
    try:
        conn.execute("DELETE FROM companies WHERE id = %s", (company_id,))
    finally:
        conn.close()


def replace_jobs(company_id, jobs):
    now = _now()
    conn = connect()
    try:
        rows = [
            (
                company_id,
                j["source_id"],
                j["title"],
                j.get("location"),
                j.get("url"),
                j.get("posted_at"),
                j.get("compensation"),
                j.get("category"),
                j.get("summary"),
                now,
                now,
            )
            for j in jobs
        ]
        conn.executemany(
            """
            INSERT INTO jobs (company_id, source_id, title, location, url, posted_at,
                              compensation, category, summary, active, first_seen, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
            ON CONFLICT (company_id, source_id) DO UPDATE SET
                title = EXCLUDED.title,
                location = EXCLUDED.location,
                url = EXCLUDED.url,
                posted_at = EXCLUDED.posted_at,
                compensation = EXCLUDED.compensation,
                category = EXCLUDED.category,
                summary = EXCLUDED.summary,
                active = TRUE,
                updated_at = EXCLUDED.updated_at
            """,
            rows,
        )
        if rows:
            seen = [j["source_id"] for j in jobs]
            placeholders = ",".join("%s" for _ in seen)
            conn.execute(
                f"UPDATE jobs SET active = FALSE WHERE company_id = %s AND active = TRUE AND source_id NOT IN ({placeholders})",
                (company_id, *seen),
            )
        else:
            conn.execute(
                "UPDATE jobs SET active = FALSE WHERE company_id = %s AND active = TRUE",
                (company_id,),
            )
        conn.execute(
            "UPDATE companies SET last_fetched = %s, last_error = NULL WHERE id = %s",
            (now, company_id),
        )
    finally:
        conn.close()


def set_company_error(company_id, error):
    conn = connect()
    try:
        conn.execute(
            "UPDATE companies SET last_error = %s, last_fetched = %s WHERE id = %s",
            (error[:500], _now(), company_id),
        )
    finally:
        conn.close()


def query_jobs(q=None, hidden_company_ids=None, intern_only=False, limit=200, offset=0):
    hidden = hidden_company_ids or []
    clauses = ["j.active = TRUE", "c.enabled = TRUE"]
    params = []
    if hidden:
        placeholders = ",".join("%s" for _ in hidden)
        clauses.append(f"j.company_id NOT IN ({placeholders})")
        params.extend(hidden)
    if q:
        like = f"%{q}%"
        clauses.append(
            "(j.title LIKE %s OR j.location LIKE %s OR j.summary LIKE %s OR c.name LIKE %s)"
        )
        params.extend([like, like, like, like])
    where = " AND ".join(clauses)
    conn = connect()
    try:
        if intern_only:
            candidates = conn.execute(
                f"SELECT j.id, j.title FROM jobs j JOIN companies c ON c.id = j.company_id WHERE {where}",
                params,
            ).fetchall()
            ids = [r["id"] for r in candidates if _INTERN_RE.search(r["title"] or "")]
            rows = []
            total = len(ids)
            if ids:
                page = ids[offset : offset + limit]
                if page:
                    placeholders = ",".join("%s" for _ in page)
                    rows = conn.execute(
                        f"""
                        SELECT j.*, c.name AS company, c.board_type, c.domain AS company_domain
                        FROM jobs j JOIN companies c ON c.id = j.company_id
                        WHERE j.id IN ({placeholders})
                        ORDER BY COALESCE(j.posted_at, '') DESC, j.id DESC
                        """,
                        page,
                    ).fetchall()
        else:
            total = conn.execute(
                f"SELECT COUNT(*) FROM jobs j JOIN companies c ON c.id = j.company_id WHERE {where}",
                params,
            ).fetchone()[0]
            rows = conn.execute(
                f"""
                SELECT j.*, c.name AS company, c.board_type, c.domain AS company_domain
                FROM jobs j JOIN companies c ON c.id = j.company_id
                WHERE {where}
                ORDER BY COALESCE(j.posted_at, '') DESC, j.id DESC
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            ).fetchall()
    finally:
        conn.close()
    return total, [dict(r) for r in rows]


def stats():
    conn = connect()
    try:
        c_total = conn.execute("SELECT COUNT(*) FROM companies WHERE enabled = TRUE").fetchone()[0]
        c_all = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        j_total = conn.execute("SELECT COUNT(*) FROM jobs WHERE active = TRUE").fetchone()[0]
        last = conn.execute(
            "SELECT MAX(last_fetched) FROM companies WHERE last_fetched IS NOT NULL"
        ).fetchone()[0]
        errors = conn.execute(
            "SELECT COUNT(*) FROM companies WHERE last_error IS NOT NULL"
        ).fetchone()[0]
    finally:
        conn.close()
    return {
        "companies_enabled": c_total,
        "companies_total": c_all,
        "jobs_active": j_total,
        "last_fetch": last,
        "companies_with_errors": errors,
    }