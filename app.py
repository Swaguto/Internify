import json
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db
from fetchers import FETCHERS, _BOARD_TYPES

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("roboradar")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
POLL_MINUTES = int(os.environ.get("POLL_MINUTES", "60"))
MAX_WORKERS = 6
IS_VERCEL = os.environ.get("VERCEL") == "1"

app = FastAPI(title="RoboRadar")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

_refresh_lock = threading.Lock()


def seed_companies():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            cfg = json.load(f)
        for c in cfg.get("companies", []):
            db.upsert_company(c["name"], c["board_type"], c["board_key"], c.get("domain", ""))


def _fetch_company(company):
    board_type = company["board_type"]
    board_key = company["board_key"]
    fetcher = FETCHERS.get(board_type)
    if not fetcher:
        db.set_company_error(company["id"], f"unknown board type '{board_type}'")
        return
    try:
        jobs = fetcher(board_key)
        db.replace_jobs(company["id"], jobs)
        log.info("fetched %2d jobs from %s (%s)", len(jobs), company["name"], board_type)
    except Exception as exc:
        log.warning("FAILED %s: %s", company["name"], exc)
        db.set_company_error(company["id"], str(exc))


def fetch_all():
    if _refresh_lock.locked():
        return False
    with _refresh_lock:
        companies = [c for c in db.list_companies() if c["enabled"]]
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            list(pool.map(_fetch_company, companies))
        return True


def run_refresh_in_background():
    t = threading.Thread(target=fetch_all, daemon=True)
    t.start()


@app.on_event("startup")
def startup():
    db.init_db()
    seed_companies()
    if IS_VERCEL:
        if db.stats()["jobs_active"] == 0:
            log.info("vercel: empty db on cold start, fetching jobs now")
            fetch_all()
        return
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        fetch_all, "interval", minutes=POLL_MINUTES, id="poll", max_instances=1, coalesce=True
    )
    scheduler.start()
    log.info("polling every %d minutes", POLL_MINUTES)
    run_refresh_in_background()


class CompanyIn(BaseModel):
    name: str
    board_type: str
    board_key: str
    domain: str = ""


class CompanyPatch(BaseModel):
    enabled: bool | None = None
    domain: str | None = None


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/api/status")
def status():
    return db.stats()


@app.get("/api/companies")
def companies():
    return db.list_companies()


@app.post("/api/companies")
def add_company(payload: CompanyIn):
    name = payload.name.strip()
    board_type = payload.board_type.strip().lower()
    board_key = payload.board_key.strip()
    domain = payload.domain.strip() if payload.domain else ""
    if not name or not board_key:
        raise HTTPException(400, "name and board_key are required")
    if board_type not in _BOARD_TYPES:
        raise HTTPException(400, f"board_type must be one of {sorted(_BOARD_TYPES)}")
    fetcher = FETCHERS[board_type]
    try:
        probe = fetcher(board_key)
    except Exception as exc:
        raise HTTPException(400, f"could not reach that board: {exc}")
    db.upsert_company(name, board_type, board_key, domain)
    db.replace_jobs(_get_by_name(name)["id"], probe)
    log.info("added company %s (%s/%s)", name, board_type, board_key)
    run_refresh_in_background()
    return {"ok": True}


def _get_by_name(name):
    for c in db.list_companies():
        if c["name"].lower() == name.lower():
            return c
    raise HTTPException(404, "company not found")


@app.patch("/api/companies/{company_id}")
def patch_company(company_id: int, payload: CompanyPatch):
    company = db.get_company(company_id)
    if not company:
        raise HTTPException(404, "company not found")
    db.set_company_meta(
        company_id,
        enabled=payload.enabled,
        domain=payload.domain.strip() if payload.domain is not None else None,
    )
    return {"ok": True}


@app.delete("/api/companies/{company_id}")
def remove_company(company_id: int):
    if not db.get_company(company_id):
        raise HTTPException(404, "company not found")
    db.delete_company(company_id)
    return {"ok": True}


@app.get("/api/jobs")
def jobs(q: str = "", hidden: str = "", intern_only: bool = False, limit: int = 300, offset: int = 0):
    hidden_ids = [int(x) for x in hidden.split(",") if x.strip().isdigit()] if hidden else []
    total, rows = db.query_jobs(
        q=q.strip(),
        hidden_company_ids=hidden_ids,
        intern_only=intern_only,
        limit=min(limit, 500),
        offset=max(offset, 0),
    )
    return {"total": total, "offset": offset, "jobs": rows}


@app.api_route("/api/refresh", methods=["GET", "POST"])
def refresh(request: Request):
    secret = os.environ.get("CRON_SECRET")
    if request.method == "GET" and secret:
        if request.headers.get("authorization") != f"Bearer {secret}":
            raise HTTPException(401, "unauthorized")
    started = fetch_all()
    return {"started": started}