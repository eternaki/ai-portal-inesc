"""Ingest publications from OpenAlex into Payload.

Run:  python -m app.pipelines.ingest data/authors.json

authors.json: [{"name": "...", "openalexId": "A5012345678", "memberId": 1}, ...]
memberId (the Payload members document id) is optional; when set, publication
authors are linked to profiles.
"""

import json
import logging
import sys
import time
from typing import Any

import httpx

from app import payload_api
from app.config import get_settings

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
        "type": _map_type(work),
        "venue": ((work.get("primary_location") or {}).get("source") or {}).get("display_name"),
        "doi": _short_doi(work),
        "openalexId": _short_openalex_id(work),
        "abstract": _reconstruct_abstract(work.get("abstract_inverted_index")),
        "citationCount": work.get("cited_by_count"),
        "pdfUrl": (work.get("open_access") or {}).get("oa_url"),
        "originalUrl": (
            (work.get("primary_location") or {}).get("landing_page_url")
            or (f"https://doi.org/{_short_doi(work)}" if _short_doi(work) else None)
        ),
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


def run(authors_file: str) -> None:
    with open(authors_file, encoding="utf-8") as f:
        authors = json.load(f)

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
            _, was_created = payload_api.upsert_publication(pub)
            created += was_created
            updated += not was_created

    logger.info("done: %s created, %s updated, %s unique works", created, updated, len(seen))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    run(sys.argv[1] if len(sys.argv) > 1 else "data/authors.json")
