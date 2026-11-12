"""Payload REST API client.

Architecture rule: the AI service does NOT write to Payload content tables
directly — only through REST. That is how summaries/bios reach the admin and
stay editable. Auth is the service user's API key (users collection, role=editor).
"""

import json
from typing import Any

import httpx

from app.config import get_settings


def _client() -> httpx.Client:
    settings = get_settings()
    # Every AI-service request is tagged so the Payload auto-process hook skips it
    # (otherwise a bulk ingest or a summary write would trigger LLM calls itself).
    headers = {"X-Skip-Autoprocess": "1"}
    if settings.payload_api_key:
        headers["Authorization"] = f"users API-Key {settings.payload_api_key}"
    return httpx.Client(
        base_url=f"{settings.payload_url}/api",
        headers=headers,
        timeout=30.0,
    )


def find(
    collection: str,
    where: dict[str, Any] | None = None,
    *,
    limit: int = 100,
    page: int = 1,
    depth: int = 0,
    sort: str | None = None,
) -> dict:
    params: dict[str, Any] = {"limit": limit, "page": page, "depth": depth}
    if where:
        params["where"] = json.dumps(where)
    if sort:
        params["sort"] = sort
    with _client() as client:
        resp = client.get(f"/{collection}", params=params)
        resp.raise_for_status()
        return resp.json()


def find_all(collection: str, where: dict[str, Any] | None = None, *, depth: int = 0) -> list[dict]:
    """Every document in the collection, paginated."""
    docs: list[dict] = []
    page = 1
    while True:
        data = find(collection, where, limit=100, page=page, depth=depth)
        docs.extend(data["docs"])
        if not data.get("hasNextPage"):
            return docs
        page += 1


def create(collection: str, data: dict) -> dict:
    with _client() as client:
        resp = client.post(f"/{collection}", json=data)
        resp.raise_for_status()
        return resp.json()["doc"]


def update(collection: str, doc_id: int | str, data: dict) -> dict:
    with _client() as client:
        resp = client.patch(f"/{collection}/{doc_id}", json=data)
        resp.raise_for_status()
        return resp.json()["doc"]


def whoami() -> dict | None:
    """The user the service key authenticates as, or None when it does not.

    Asked before a bulk write: an anonymous client sees only *published* rows, so
    an ingest without a working key cannot find the drafts and the parked
    duplicates and would create them all over again.
    """
    with _client() as client:
        resp = client.get("/users/me")
        resp.raise_for_status()
        return resp.json().get("user")


def find_existing_publication(data: dict) -> dict | None:
    """The publication this record would update, matched on openalexId or DOI."""
    # Match on both openalexId and DOI: OpenAlex sometimes has two records
    # (preprint + published) sharing one DOI — for us that is one publication.
    conditions: list[dict[str, Any]] = []
    if data.get("openalexId"):
        conditions.append({"openalexId": {"equals": data["openalexId"]}})
    if data.get("doi"):
        conditions.append({"doi": {"equals": data["doi"]}})
    if not conditions:
        return None
    docs = find("publications", {"or": conditions}, limit=1)["docs"]
    return docs[0] if docs else None


# What a re-ingest may refresh on a publication that already exists. Not `status`
# (an editor owns it: a published paper must not fall back to a draft), not the
# summary, and not `authors`: the incoming list links only the members this run
# follows, so writing it would wipe every member link the linking scripts and
# editors added, and take those papers off people's profile pages.
_REFRESHABLE = ("citationCount", "abstract", "pdfUrl", "originalUrl", "venue", "referencedWorks")


def upsert_publication(data: dict) -> tuple[dict, bool]:
    """Create or update a publication. Matching: openalexId, then DOI.

    Returns (document, created). On update only _REFRESHABLE fields are written.
    """
    doc = find_existing_publication(data)
    if doc:
        safe_update = {k: v for k, v in data.items() if k in _REFRESHABLE}
        return update("publications", doc["id"], safe_update), False

    # New ingested paper enters the editorial queue as a draft — nothing an
    # automated pipeline creates is published without human approval.
    create_data = {"status": "pending_review", **data}
    try:
        return create("publications", create_data), True
    except httpx.HTTPStatusError as err:
        # Slug collision: the conference and journal versions share one title.
        # Retry with a uniquified slug (the Payload hook slugifies it).
        if err.response.status_code == 400 and "slug" in err.response.text:
            suffix = data.get("openalexId") or data.get("doi") or str(data.get("year") or "")
            retry = {**create_data, "slug": f"{data['title']} {suffix}"}
            return create("publications", retry), True
        raise
