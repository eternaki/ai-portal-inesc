"""Backfill publication links (originalUrl / pdfUrl) from OpenAlex.

Run:  python -m app.pipelines.backfill_links [--all] [--dry-run]

Publications ingested before `originalUrl` existed carry no link, so the site
falls back to doi.org — the publisher's paywall — or shows no link at all. This
re-reads each work from OpenAlex by its stored `openalexId` and fills the link
fields, preferring an open-access copy (see ingest._original_url).

By default only publications missing `originalUrl` are touched. `--all` refreshes
every publication that has an OpenAlex id, which also picks up newly deposited
open-access copies. Nothing else about the record is changed.
"""

import argparse
import logging
import time

import httpx

from app import payload_api
from app.config import get_settings
from app.pipelines.ingest import OPENALEX, _original_url

logger = logging.getLogger(__name__)

# OpenAlex accepts an OR-list of ids in one filter; 50 keeps the URL well under
# any length limit while cutting ~250 requests down to ~5.
BATCH_SIZE = 50


def _fetch_works(openalex_ids: list[str]) -> dict[str, dict]:
    """Fetch works by OpenAlex id, keyed by short id (W...)."""
    works: dict[str, dict] = {}
    mailto = get_settings().openalex_mailto
    with httpx.Client(base_url=OPENALEX, timeout=60.0) as client:
        for start in range(0, len(openalex_ids), BATCH_SIZE):
            batch = openalex_ids[start : start + BATCH_SIZE]
            resp = client.get(
                "/works",
                params={
                    "filter": f"openalex_id:{'|'.join(batch)}",
                    "per-page": BATCH_SIZE,
                    "mailto": mailto,
                },
            )
            resp.raise_for_status()
            for work in resp.json().get("results", []):
                works[work["id"].rsplit("/", 1)[-1]] = work
            time.sleep(0.2)  # be polite to the free API
    return works


def run(*, refresh_all: bool = False, dry_run: bool = False) -> None:
    publications = payload_api.find_all("publications")
    candidates = [
        p
        for p in publications
        if p.get("openalexId") and (refresh_all or not p.get("originalUrl"))
    ]
    logger.info(
        "%s publications, %s with an OpenAlex id to check", len(publications), len(candidates)
    )
    if not candidates:
        return

    works = _fetch_works([p["openalexId"] for p in candidates])
    logger.info("resolved %s of %s works from OpenAlex", len(works), len(candidates))

    updated = unchanged = missing = 0
    for pub in candidates:
        work = works.get(pub["openalexId"])
        if not work:
            missing += 1
            continue

        patch = {}
        original_url = _original_url(work)
        if original_url and original_url != pub.get("originalUrl"):
            patch["originalUrl"] = original_url
        pdf_url = (work.get("open_access") or {}).get("oa_url")
        if pdf_url and pdf_url != pub.get("pdfUrl"):
            patch["pdfUrl"] = pdf_url

        if not patch:
            unchanged += 1
            continue
        if dry_run:
            logger.info("would update %s: %s", pub["id"], patch)
        else:
            payload_api.update("publications", pub["id"], patch)
        updated += 1

    logger.info(
        "done: %s updated%s, %s already current, %s not found in OpenAlex",
        updated,
        " (dry run)" if dry_run else "",
        unchanged,
        missing,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all",
        action="store_true",
        dest="refresh_all",
        help="refresh every publication, not just those with no originalUrl",
    )
    parser.add_argument("--dry-run", action="store_true", help="report changes without writing")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    run(refresh_all=args.refresh_all, dry_run=args.dry_run)
