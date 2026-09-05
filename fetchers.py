import email.utils
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx

TIMEOUT = httpx.Timeout(30.0)
_HTML_TAG = re.compile(r"<[^>]+>")
_BOARD_TYPES = {"greenhouse", "lever", "workable", "ashby", "rss", "amazon", "nvidia"}


def strip_html(text):
    if not text:
        return ""
    text = _HTML_TAG.sub(" ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def summarize(text, limit=300):
    text = strip_html(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _iso(value):
    if not value:
        return None
    try:
        if isinstance(value, (int, float)):
            if value > 10_000_000_000:
                value = value / 1000.0
            return datetime.fromtimestamp(value, timezone.utc).isoformat()
        value = value.strip()
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed:
            return parsed.astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError, OverflowError):
        pass
    return value


def _job(source_id, title, location, url, posted_at=None, compensation=None, category=None, summary=None):
    return {
        "source_id": str(source_id),
        "title": strip_html(title) if title else "",
        "location": strip_html(location) if location else "",
        "url": url or "",
        "posted_at": _iso(posted_at),
        "compensation": compensation or "",
        "category": category or "",
        "summary": summary or "",
    }


def _get_json(url, *, post=False, data=None):
    try:
        if post:
            resp = httpx.post(url, json=data, timeout=TIMEOUT)
        else:
            resp = httpx.get(url, timeout=TIMEOUT)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"network error: {exc}") from None
    if resp.status_code in (401, 403):
        raise RuntimeError("that board is private or requires an API key")
    if resp.status_code == 404:
        raise RuntimeError("not found — check the board key or feed URL")
    if resp.status_code >= 400:
        raise RuntimeError(f"the board returned HTTP {resp.status_code}")
    try:
        return resp.json()
    except ValueError:
        raise RuntimeError(
            "no JSON returned — the board type probably doesn't match this company"
        ) from None


def fetch_greenhouse(key):
    url = f"https://boards-api.greenhouse.io/v1/boards/{key}/jobs"
    data = _get_json(url)
    if "jobs" not in data:
        raise RuntimeError(f"greenhouse board '{key}' returned unexpected payload")
    jobs = []
    for j in data.get("jobs", []):
        loc = j.get("location") or {}
        location = loc.get("name") if isinstance(loc, dict) else str(loc)
        jobs.append(
            _job(
                j.get("id"),
                j.get("title"),
                location,
                j.get("absolute_url"),
                j.get("updated_at"),
                summary=summarize(j.get("content", "")),
            )
        )
    return jobs


def fetch_lever(key):
    url = f"https://api.lever.co/v0/postings/{key}?mode=json&limit=100"
    data = _get_json(url)
    if not isinstance(data, list):
        raise RuntimeError(f"lever board '{key}' returned unexpected payload")
    jobs = []
    for j in data:
        comp = ""
        c = j.get("compensation") or {}
        if c:
            parts = []
            if c.get("total"):
                parts.append(c["total"])
            elif c.get("min") or c.get("max"):
                parts.append(f"{c.get('min') or '?'}-{c.get('max') or '?'}")
            if c.get("currency"):
                parts.append(c["currency"])
            comp = " ".join(parts)
        jobs.append(
            _job(
                j.get("id"),
                j.get("text") or j.get("headline"),
                j.get("locationText"),
                j.get("applyUrl"),
                j.get("createdAt"),
                compensation=comp,
                category=j.get("category"),
                summary=summarize(j.get("descriptionPlain", "")) or summarize(j.get("description", "")),
            )
        )
    return jobs


def fetch_workable(key):
    url = f"https://apply.workable.com/api/v1/widget/accounts/{key}?details=true"
    data = _get_json(url)
    jobs = []
    for j in data.get("jobs", []):
        city = j.get("city") or ""
        country = j.get("country") or ""
        location = ", ".join(p for p in (city, country) if p)
        jobs.append(
            _job(
                j.get("shortcode"),
                j.get("title"),
                location,
                j.get("url") or j.get("application_url"),
                j.get("published_on"),
                category=j.get("department"),
                summary=summarize(j.get("description", "")),
            )
        )
    if not jobs and not data.get("jobs"):
        raise RuntimeError(f"workable board '{key}' returned no jobs")
    return jobs


def fetch_ashby(key):
    url = f"https://api.ashbyhq.com/posting-api/job-board/{key}"
    data = _get_json(url, post=True, data={"includeCompensation": True})
    jobs = []
    for j in data.get("jobs", []):
        loc = j.get("location") or {}
        location = loc.get("name") if isinstance(loc, dict) else str(loc)
        comp = ""
        c = j.get("compensation") or {}
        if c.get("compensationTierSummary"):
            comp = c["compensationTierSummary"]
        jobs.append(
            _job(
                j.get("jobUrl") or j.get("id") or j.get("title"),
                j.get("title"),
                location,
                j.get("applyUrl") or j.get("jobUrl"),
                j.get("publishedAt"),
                compensation=comp,
                category=j.get("employmentType"),
                summary=summarize(j.get("descriptionHtml", "")),
            )
        )
    return jobs


def fetch_rss(url):
    try:
        resp = httpx.get(url, timeout=TIMEOUT, follow_redirects=True)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"network error: {exc}") from None
    if resp.status_code >= 400:
        raise RuntimeError(f"the feed returned HTTP {resp.status_code} — check the URL")
    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError:
        raise RuntimeError("not a valid RSS/Atom feed — check the URL") from None
    channel = root.find("channel")
    items = channel.findall("item") if channel is not None else root.findall(
        ".//{http://www.w3.org/2005/Atom}entry"
    )
    jobs = []
    for item in items:
        title = item.findtext("title") or item.findtext("{http://www.w3.org/2005/Atom}title")
        link = item.findtext("link") or item.findtext("{http://www.w3.org/2005/Atom}link")
        if link and "{http://www.w3.org/2005/Atom}" in str(item.tag):
            link = link if isinstance(link, str) else link
        pub = item.findtext("pubDate") or item.findtext(
            "{http://www.w3.org/2005/Atom}published"
        )
        desc = item.findtext("description") or item.findtext(
            "{http://www.w3.org/2005/Atom}summary"
        )
        category = item.findtext("category") or ""
        guid = item.findtext("guid") or link
        jobs.append(
            _job(
                guid,
                title,
                None,
                link,
                pub,
                category=category,
                summary=summarize(desc or ""),
            )
        )
    return jobs


def fetch_amazon(key):
    queries = [
        "software%20development%20engineer%20intern",
        "software%20engineer%20intern",
        "applied%20scientist%20intern",
        "machine%20learning%20intern",
    ]
    seen = set()
    jobs = []
    for q in queries:
        for page in range(1, 3):
            url = f"https://www.amazon.jobs/en/search.json?base_query={q}&country%5B%5D=USA&page={page}&sort=recent"
            try:
                data = _get_json(url)
            except Exception:
                break
            for j in data.get("jobs", []):
                if j.get("country_code") != "USA":
                    continue
                if not j.get("is_intern") and "intern" not in (j.get("title") or "").lower():
                    continue
                jid = str(j.get("id"))
                if jid in seen:
                    continue
                seen.add(jid)
                num = (j.get("url_next_step") or "").find("/jobs/")
                jobs.append(
                    _job(
                        jid,
                        j.get("title"),
                        f"{j.get('city', '')}, {j.get('state', '')}",
                        f"https://www.amazon.jobs/en/jobs/{jid}",
                        j.get("posted_date"),
                        category="SWE",
                    )
                )
    return jobs


def fetch_nvidia(key):
    state_re = re.compile(r"\b(CA|WA|TX|MA|GA|IL|NC|OR|NY|CO|AZ|UT|NJ|MN|MD|VA|FL|PA)\b")
    jobs = []
    for offset in range(0, 181, 20):
        url = "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs"
        try:
            data = _get_json(url, post=True, data={"appliedFacets": {}, "limit": 20, "offset": offset, "searchText": "intern"})
        except Exception:
            break
        for j in data.get("jobPostings", []):
            if "intern" not in (j.get("title") or "").lower():
                continue
            loc = j.get("locationsText") or ""
            if not state_re.search(loc) and not re.search(r"remote|united states", loc, re.IGNORECASE):
                continue
            jobs.append(
                _job(
                    j.get("externalPath"),
                    j.get("title"),
                    loc.replace(", United States", ""),
                    f"https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite{j.get('externalPath', '')}",
                    j.get("postedOn"),
                    category="SWE",
                )
            )
    return jobs


FETCHERS = {
    "greenhouse": fetch_greenhouse,
    "lever": fetch_lever,
    "workable": fetch_workable,
    "ashby": fetch_ashby,
    "rss": fetch_rss,
    "amazon": fetch_amazon,
    "nvidia": fetch_nvidia,
}