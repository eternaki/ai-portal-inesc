"""Maintenance agent: data-health checks that produce an administrative report.

Read-only. Surfaces problems for a human to fix in the admin — it never edits or
deletes content itself (the site is human-maintained by design). Covers the plan's
list: missing embeddings, broken links, invalid DOIs, duplicates, failed jobs,
incomplete content.

Run ad hoc:  python -m app.pipelines.maintenance
Or via the HTTP endpoint GET /maintenance/report (used by the admin dashboard).
"""

import logging
import re
from typing import Any

import httpx

from app import db, payload_api

logger = logging.getLogger(__name__)

# A DOI is "10." + registrant + "/" + suffix. Loose but catches obvious junk.
_DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")


def _missing_embeddings() -> list[dict]:
    """Published papers with no vector — invisible to semantic search."""
    sql = """
        SELECT p.id, p.title
        FROM publications p
        LEFT JOIN publication_embeddings e ON e.publication_id = p.id
        WHERE p.status = 'published' AND e.publication_id IS NULL
        ORDER BY p.id
    """
    try:
        with db.connect() as conn:
            rows = conn.execute(sql).fetchall()
        return [{"id": r[0], "title": r[1]} for r in rows]
    except Exception as exc:
        logger.warning("missing_embeddings check failed: %s", exc)
        return []


def _duplicates() -> list[dict]:
    """Papers sharing a normalized title or a DOI — likely double-ingested."""
    out: list[dict] = []
    try:
        with db.connect() as conn:
            for kind, sql in (
                (
                    "title",
                    "SELECT lower(trim(title)) k, array_agg(id) ids FROM publications "
                    "GROUP BY lower(trim(title)) HAVING count(*) > 1",
                ),
                (
                    "doi",
                    "SELECT doi k, array_agg(id) ids FROM publications "
                    "WHERE doi IS NOT NULL AND doi <> '' GROUP BY doi HAVING count(*) > 1",
                ),
            ):
                for row in conn.execute(sql).fetchall():
                    out.append({"by": kind, "value": row[0], "ids": list(row[1])})
    except Exception as exc:
        logger.warning("duplicates check failed: %s", exc)
    return out


def _check_link(client: httpx.Client, url: str) -> bool:
    """True if the URL looks reachable. HEAD, falling back to a ranged GET."""
    try:
        r = client.head(url, follow_redirects=True, timeout=8.0)
        if r.status_code >= 400:
            r = client.get(url, follow_redirects=True, timeout=8.0, headers={"Range": "bytes=0-0"})
        return r.status_code < 400
    except Exception:
        return False


def run_checks(*, check_links: bool = False, link_budget: int = 40) -> dict[str, Any]:
    """Assemble the health report. Link-checking is opt-in (network, slow)."""
    pubs = payload_api.find_all("publications", where={"status": {"equals": "published"}})

    invalid_dois = [
        {"id": p["id"], "title": p.get("title"), "doi": p.get("doi")}
        for p in pubs
        if p.get("doi") and not _DOI_RE.match(str(p["doi"]).strip())
    ]

    incomplete = [
        {
            "id": p["id"],
            "title": p.get("title"),
            "missing": [
                *(["abstract"] if not (p.get("abstract") or "").strip() else []),
                *(["summary"] if p.get("aiSummaryStatus") == "none" else []),
            ],
        }
        for p in pubs
        if not (p.get("abstract") or "").strip() or p.get("aiSummaryStatus") == "none"
    ]

    failed = payload_api.find(
        "publications", where={"status": {"equals": "failed"}}, limit=100
    )["docs"]

    broken_links: list[dict] = []
    links_checked = 0
    links_truncated = False
    if check_links:
        candidates = [
            (p["id"], p.get("title"), field, p.get(field))
            for p in pubs
            for field in ("originalUrl", "pdfUrl")
            if p.get(field)
        ]
        if len(candidates) > link_budget:
            links_truncated = True
            candidates = candidates[:link_budget]
        with httpx.Client() as client:
            for pub_id, title, field, url in candidates:
                links_checked += 1
                if not _check_link(client, str(url)):
                    broken_links.append({"id": pub_id, "title": title, "field": field, "url": url})

    checks = {
        "missing_embeddings": _missing_embeddings(),
        "duplicates": _duplicates(),
        "invalid_dois": invalid_dois,
        "incomplete_content": incomplete,
        "failed_jobs": [{"id": d["id"], "title": d.get("title")} for d in failed],
        "broken_links": broken_links,
    }
    summary = {name: len(items) for name, items in checks.items()}
    return {
        "published_total": len(pubs),
        "links_checked": links_checked,
        "links_truncated": links_truncated,
        "summary": summary,
        "checks": checks,
    }


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    print(json.dumps(run_checks(check_links=False)["summary"], indent=2))
