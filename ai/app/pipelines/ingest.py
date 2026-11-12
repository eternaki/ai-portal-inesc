"""Ingest publications from OpenAlex into Payload.

Run:  python -m app.pipelines.ingest                    # authors = active members
      python -m app.pipelines.ingest --dry-run          # report only, write nothing
      python -m app.pipelines.ingest data/authors.json  # authors = a file

Full runbook (before / during / after a bulk import): docs/PUBLICATION-SYNC.md.

With no argument the authors are the active members whose profile has an OpenAlex
ID (see ingest_authors.py) — the list editors maintain in the admin. The file form
is kept for one-off imports of people who are not members:
[{"name": "...", "openalexId": "A5012345678", "memberId": 1}, ...]
memberId (the Payload members document id) is optional; when set, publication
authors are linked to profiles.

New papers arrive as pending_review drafts; re-runs only refresh citation counts,
abstracts, venue and links on papers already there — never status, summary or the
author list (payload_api._REFRESHABLE).
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app import payload_api
from app.config import get_settings
from app.pipelines.extractive import (
    EXTRACTIVE_MODEL,
    EXTRACTIVE_VERSION,
    extractive_summary,
)

logger = logging.getLogger(__name__)

OPENALEX = "https://api.openalex.org"

# OpenAlex work.type → our select value
TYPE_MAP = {
    "article": "conference",  # refined below using source.type
    "book-chapter": "book",
    "book": "book",
    "preprint": "preprint",
}


def _reconstruct_abstract(inverted: dict[str, list[int]] | None) -> str | None:
    """OpenAlex returns the abstract as an inverted index — rebuild it into text."""
    if not inverted:
        return None
    positions: list[tuple[int, str]] = []
    for word, idxs in inverted.items():
        positions.extend((i, word) for i in idxs)
    return " ".join(word for _, word in sorted(positions))


def _map_type(work: dict[str, Any]) -> str:
    source_type = ((work.get("primary_location") or {}).get("source") or {}).get("type")
    if source_type == "journal":
        return "journal"
    if work.get("type") == "article" and source_type == "conference":
        return "conference"
    return TYPE_MAP.get(work.get("type", ""), "other")


def _short_openalex_id(work: dict[str, Any]) -> str:
    # "https://openalex.org/W2741809807" -> "W2741809807"
    return work["id"].rsplit("/", 1)[-1]


def _short_doi(work: dict[str, Any]) -> str | None:
    doi = work.get("doi")
    if not doi:
        return None
    return doi.removeprefix("https://doi.org/")


def _original_url(work: dict[str, Any]) -> str | None:
    """Best link to the actual paper, open access first.

    A DOI resolves to the publisher, which is a paywall more often than not. An
    OpenAlex `oa_url` (arXiv, a repository, the publisher's free copy) is a page
    the reader can actually read, so it wins; the landing page and the DOI are
    fallbacks for works with no open copy.
    """
    oa_url = (work.get("open_access") or {}).get("oa_url")
    landing = (work.get("primary_location") or {}).get("landing_page_url")
    doi = _short_doi(work)
    return oa_url or landing or (f"https://doi.org/{doi}" if doi else None)


def work_to_publication(work: dict[str, Any], member_by_author_id: dict[str, int]) -> dict:
    authors = []
    for authorship in work.get("authorships", []):
        author = authorship.get("author") or {}
        author_openalex = (author.get("id") or "").rsplit("/", 1)[-1]
        entry: dict[str, Any] = {"name": author.get("display_name") or "Unknown"}
        if author_openalex in member_by_author_id:
            entry["member"] = member_by_author_id[author_openalex]
        authors.append(entry)

    return {
        "title": work.get("title") or "(untitled)",
        "year": work.get("publication_year"),
        "publicationDate": work.get("publication_date"),
        "type": _map_type(work),
        "venue": ((work.get("primary_location") or {}).get("source") or {}).get("display_name"),
        "doi": _short_doi(work),
        "openalexId": _short_openalex_id(work),
        "abstract": _reconstruct_abstract(work.get("abstract_inverted_index")),
        "citationCount": work.get("cited_by_count"),
        "pdfUrl": (work.get("open_access") or {}).get("oa_url"),
        "originalUrl": _original_url(work),
        "authors": authors,
        "referencedWorks": [
            ref.rsplit("/", 1)[-1] for ref in (work.get("referenced_works") or [])
        ],
    }


def _normalize_identifier(identifier: str) -> tuple[str, str]:
    """Classify a free-form identifier into an OpenAlex lookup.

    Accepts a DOI, a DOI URL, an OpenAlex work id/URL, an arbitrary landing URL,
    or a plain title. Returns (kind, value) where kind is 'openalex' | 'doi' |
    'title' — used to build the right OpenAlex query. A landing URL we cannot map
    to a DOI/OpenAlex id falls back to a title search on the raw string.
    """
    s = identifier.strip()
    low = s.lower()

    # OpenAlex work id, possibly as a URL
    tail = s.rsplit("/", 1)[-1]
    if tail[:1] in ("W", "w") and tail[1:].isdigit():
        return "openalex", tail.upper()

    # DOI, bare or as a doi.org URL
    if "doi.org/" in low:
        return "doi", s.split("doi.org/", 1)[1].strip()
    if low.startswith("doi:"):
        return "doi", s[4:].strip()
    if low.startswith("10.") and "/" in s:
        return "doi", s

    return "title", s


def fetch_work_by_identifier(identifier: str) -> dict | None:
    """Resolve one OpenAlex work from a DOI / OpenAlex id / URL / title."""
    kind, value = _normalize_identifier(identifier)
    mailto = get_settings().openalex_mailto
    with httpx.Client(base_url=OPENALEX, timeout=60.0) as client:
        if kind == "openalex":
            resp = client.get(f"/works/{value}", params={"mailto": mailto})
        elif kind == "doi":
            resp = client.get(f"/works/doi:{value}", params={"mailto": mailto})
        else:
            resp = client.get(
                "/works",
                params={"filter": f"title.search:{value}", "per-page": 1, "mailto": mailto},
            )
            resp.raise_for_status()
            results = resp.json().get("results") or []
            return results[0] if results else None

        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


def resolve_publication(identifier: str) -> tuple[dict | None, dict | None]:
    """Look up a publication for admin preview: returns (publication, duplicate).

    `publication` is the normalized draft (not yet created). `duplicate` is an
    existing Payload publication with the same openalexId/doi, or None. Nothing is
    written — creation happens only after a human approves (editorial workflow).
    """
    work = fetch_work_by_identifier(identifier)
    if not work:
        return None, None
    pub = work_to_publication(work, {})

    conditions: list[dict[str, Any]] = []
    if pub.get("openalexId"):
        conditions.append({"openalexId": {"equals": pub["openalexId"]}})
    if pub.get("doi"):
        conditions.append({"doi": {"equals": pub["doi"]}})
    duplicate = None
    if conditions:
        existing = payload_api.find("publications", {"or": conditions}, limit=1)["docs"]
        duplicate = existing[0] if existing else None
    return pub, duplicate


def fetch_author_works(author_id: str) -> list[dict]:
    """Every work by an author (OpenAlex cursor pagination)."""
    works: list[dict] = []
    cursor = "*"
    params_base = {
        "filter": f"authorships.author.id:{author_id}",
        "per-page": 100,
        "mailto": get_settings().openalex_mailto,
    }
    with httpx.Client(base_url=OPENALEX, timeout=60.0) as client:
        while cursor:
            resp = client.get("/works", params={**params_base, "cursor": cursor})
            resp.raise_for_status()
            data = resp.json()
            works.extend(data["results"])
            cursor = data.get("meta", {}).get("next_cursor")
            time.sleep(0.2)  # be polite to the free API
    return works


def load_authors_file(authors_file: str) -> list[dict]:
    with open(authors_file, encoding="utf-8") as f:
        return json.load(f)


def run(authors: list[dict], *, apply: bool = True) -> None:
    """Import every work of these authors. With apply=False nothing is written:
    the run only reports how many papers would be created and how many refreshed.
    """
    member_by_author_id = {
        a["openalexId"]: a["memberId"] for a in authors if a.get("memberId") is not None
    }

    seen: set[str] = set()
    created = updated = 0
    for author in authors:
        logger.info("fetching works for %s (%s)", author["name"], author["openalexId"])
        for work in fetch_author_works(author["openalexId"]):
            openalex_id = _short_openalex_id(work)
            if openalex_id in seen:  # one paper shared by several group members
                continue
            seen.add(openalex_id)
            pub = work_to_publication(work, member_by_author_id)
            # Attach a deterministic extractive summary so a freshly ingested paper
            # arrives with a readable draft — no LLM, no quota, works during bulk
            # ingest. upsert_publication applies this only on CREATE; on update it
            # is dropped, so an existing (possibly human-edited) summary is safe.
            if (pub.get("abstract") or "").strip():
                pub["aiSummary"] = extractive_summary(pub)
                pub["aiSummaryStatus"] = "generated"
                pub["aiSummaryModel"] = EXTRACTIVE_MODEL
                pub["aiSummaryPromptVersion"] = EXTRACTIVE_VERSION
                pub["aiSummaryGeneratedAt"] = datetime.now(timezone.utc).isoformat()
            if apply:
                _, was_created = payload_api.upsert_publication(pub)
            else:
                was_created = payload_api.find_existing_publication(pub) is None
                if was_created:
                    logger.info("would create: %s (%s)", pub["title"][:90], pub.get("year"))
            created += was_created
            updated += not was_created

    verb = ("created", "updated") if apply else ("would be created", "would be refreshed")
    logger.info(
        "done: %s %s, %s %s, %s unique works", created, verb[0], updated, verb[1], len(seen)
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.pipelines.ingest")
    parser.add_argument("authors_file", nargs="?", help="JSON list of authors (default: members)")
    parser.add_argument(
        "--dry-run", action="store_true", help="Report what would change; write nothing."
    )
    args = parser.parse_args(argv)

    # Refuse before touching anything: without an authenticated key Payload shows
    # only published rows, so every draft and every parked duplicate looks new and
    # gets created again — a site-wide duplication that takes a day to undo.
    try:
        user = payload_api.whoami()
    except httpx.HTTPError as err:
        logger.error("cannot reach Payload at %s: %s", get_settings().payload_url, err)
        return 2
    if not user:
        logger.error("PAYLOAD_API_KEY is missing or not accepted by Payload; refusing to run")
        return 2

    if args.authors_file:
        authors = load_authors_file(args.authors_file)
    else:
        from app.pipelines.ingest_authors import load_member_authors

        authors, invalid = load_member_authors()
        for name in invalid:
            logger.warning(
                "skipped %s: OpenAlex ID is not an author id (A...) or another member has it", name
            )
        logger.info("following %s active member(s) with an OpenAlex ID", len(authors))

    # An empty list is a configuration problem, not a quiet night: exit non-zero so
    # a scheduled run shows up as failed instead of "0 created" forever.
    if not authors:
        logger.error(
            "no authors to follow: fill in the OpenAlex ID on active members in the admin"
        )
        return 1
    run(authors, apply=not args.dry_run)
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(main(sys.argv[1:]))
