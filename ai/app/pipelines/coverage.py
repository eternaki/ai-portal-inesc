"""Publication coverage per member: what the platform actually added.

Answers the question the group asked of the prototype — "this researcher was
known to have 10 papers; how many did the system find?" — with three numbers per
member:

  on_site   publications linked to the profile and published here (what we show)
  baseline  what was known before ingest (Members.knownPublicationCount, manual)
  discovered = on_site - baseline   <- the headline "10 -> 13 means +3"

Optionally a fourth, from OpenAlex (`GET /authors/{id}.works_count`):

  missing_vs_openalex = openalex_total - on_site   (how much is still uncovered)

Read-only, like the maintenance agent: it reports, a human decides. Members with
no baseline are reported with `discovered: null` — an unknown baseline is never
treated as zero, which would fake a discovery.

Run ad hoc:  python -m app.pipelines.coverage [--openalex]
Or via GET /coverage/report (used by the admin dashboard).
"""

import logging
from typing import Any

import httpx

from app import db
from app.config import get_settings
from app.pipelines.ingest import OPENALEX

logger = logging.getLogger(__name__)

# One row per member with the number of published publications linked to them.
# LEFT JOINs so members with zero linked papers still appear (that is itself a
# finding). The status filter sits in the JOIN, not WHERE, or it would turn the
# outer join into an inner one and hide those members.
_MEMBER_COUNTS_SQL = """
    SELECT m.id,
           m.name,
           m.openalex_id,
           m.known_publication_count,
           count(DISTINCT p.id) AS on_site
    FROM members m
    LEFT JOIN publications_authors pa ON pa.member_id = m.id
    LEFT JOIN publications p ON p.id = pa._parent_id AND p.status = 'published'
    GROUP BY m.id, m.name, m.openalex_id, m.known_publication_count
    ORDER BY m.name
"""


def _as_int(value: Any) -> int | None:
    """Coerce a DB numeric (Decimal) to int; None stays None (= unknown)."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def member_gap(on_site: int, baseline: int | None, openalex_total: int | None = None) -> dict:
    """The per-member arithmetic, isolated so it can be unit-tested without a DB.

    `discovered` is deliberately signed: a negative value means the site shows
    fewer papers than were already known, which is a coverage problem worth
    seeing rather than clamping away.
    """
    return {
        "on_site": on_site,
        "baseline": baseline,
        "discovered": None if baseline is None else on_site - baseline,
        "openalex_total": openalex_total,
        "missing_vs_openalex": None if openalex_total is None else openalex_total - on_site,
    }


def fetch_openalex_works_count(client: httpx.Client, author_id: str) -> int | None:
    """OpenAlex's own count of works for an author id, or None if unavailable."""
    try:
        resp = client.get(
            f"/authors/{author_id}", params={"mailto": get_settings().openalex_mailto}
        )
        if resp.status_code >= 400:
            return None
        return _as_int(resp.json().get("works_count"))
    except Exception as exc:  # noqa: BLE001 - a reporting extra must not fail the report
        logger.warning("openalex works_count failed for %s: %s", author_id, exc)
        return None


def _member_rows() -> list[tuple]:
    with db.connect() as conn:
        return conn.execute(_MEMBER_COUNTS_SQL).fetchall()


def run_report(*, check_openalex: bool = False, openalex_budget: int = 60) -> dict[str, Any]:
    """Assemble the coverage report. The OpenAlex lookup is opt-in (network, slow)."""
    rows = _member_rows()

    members: list[dict] = []
    openalex_checked = 0
    openalex_truncated = False

    client = httpx.Client(base_url=OPENALEX, timeout=30.0) if check_openalex else None
    try:
        for member_id, name, openalex_id, known, on_site in rows:
            works_count = None
            if client and openalex_id:
                if openalex_checked >= openalex_budget:
                    openalex_truncated = True
                else:
                    openalex_checked += 1
                    works_count = fetch_openalex_works_count(client, str(openalex_id))
            members.append(
                {
                    "id": member_id,
                    "name": name,
                    "openalexId": openalex_id,
                    **member_gap(int(on_site), _as_int(known), works_count),
                }
            )
    finally:
        if client:
            client.close()

    return {
        **summarize(members),
        "openalex_checked": openalex_checked,
        "openalex_truncated": openalex_truncated,
        "members": members,
    }


def summarize(members: list[dict]) -> dict[str, Any]:
    """Roll the per-member rows up into the totals the dashboard shows.

    Totals over baselines only count members that HAVE a baseline, so the
    headline "+N discovered" is always comparing like with like.
    """
    with_baseline = [m for m in members if m.get("baseline") is not None]
    checked = [m for m in members if m.get("openalex_total") is not None]
    return {
        "members_total": len(members),
        "members_with_baseline": len(with_baseline),
        "members_without_links": len([m for m in members if m["on_site"] == 0]),
        "totals": {
            "on_site": sum(m["on_site"] for m in members),
            "on_site_with_baseline": sum(m["on_site"] for m in with_baseline),
            "baseline": sum(m["baseline"] for m in with_baseline),
            "discovered": sum(m["discovered"] for m in with_baseline),
            "missing_vs_openalex": sum(m["missing_vs_openalex"] for m in checked),
        },
    }


if __name__ == "__main__":
    import json
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    report = run_report(check_openalex="--openalex" in sys.argv)
    if "--summary" in sys.argv:
        report.pop("members", None)
    print(json.dumps(report, indent=2, default=str))
