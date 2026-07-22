"""HTTP endpoints of the AI service.

The site's runtime dependency on the LLM is minimal: /search runs on pgvector
only (no LLM call); /generate/* are triggered manually from the admin.
"""

import logging
import re
import secrets
import time
import uuid
from collections import defaultdict, deque

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app import payload_api
from app.config import get_settings
from app.llm.errors import LLMError
from app.llm.client import complete, complete_json, load_prompt
from app.llm.service import llm_service
from app.rag.models import RagRequest
from app.rag.service import answer_question

logger = logging.getLogger(__name__)

router = APIRouter()

# Per-IP rate limit for the public /chat endpoint (the only public LLM surface).
# In-memory is fine for a single-process service; free-tier LLM quotas are the
# real budget being protected here.
_CHAT_WINDOW_SEC = 60
_CHAT_MAX_PER_WINDOW = 8
_chat_hits: dict[str, deque] = defaultdict(deque)


def check_chat_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    hits = _chat_hits[client_ip]
    while hits and now - hits[0] > _CHAT_WINDOW_SEC:
        hits.popleft()
    if len(hits) >= _CHAT_MAX_PER_WINDOW:
        raise HTTPException(429, "too many messages, please slow down")
    hits.append(now)


def require_service_token(x_service_token: str | None) -> None:
    """Mutating endpoints (paid LLM calls + CMS writes) require a token.

    AI_SERVICE_TOKEN is mandatory: without it in the config, mutating endpoints
    are disabled.
    """
    expected = get_settings().ai_service_token
    if not expected:
        raise HTTPException(503, "AI_SERVICE_TOKEN is not configured; endpoint disabled")
    if not x_service_token or not secrets.compare_digest(x_service_token, expected):
        raise HTTPException(401, "invalid or missing X-Service-Token header")


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/health/llm")
def llm_health() -> dict:
    return llm_service.readiness()


def llm_error_response(err: LLMError) -> JSONResponse:
    return JSONResponse(status_code=err.http_status, content=err.to_response())


@router.get("/search")
def search(
    q: str,
    limit: int = 10,
    type: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    author: str | None = None,
) -> dict:
    """Hybrid search: full-text + semantic, fused (RRF). Optional filters.

    No LLM call. Works (as pure full-text) even if the embedding path is down.
    """
    if len(q) > 500 or not q.strip():
        raise HTTPException(400, "query must be 1..500 chars")
    limit = max(1, min(limit, 50))
    from app import search as search_mod
    from app.settings_cache import feature_enabled

    # Over-fetch fused candidates so filters still leave a full page of results.
    ranked_ids = search_mod.hybrid_search(
        q, limit=limit * 4, semantic_limit=40, use_semantic=feature_enabled("enableSemanticSearch")
    )
    if not ranked_ids:
        return {"query": q, "results": []}

    # Resolve + enforce published + apply filters via Payload (single query).
    conditions: list[dict] = [
        {"id": {"in": ranked_ids}},
        {"status": {"equals": "published"}},
    ]
    if type:
        conditions.append({"type": {"equals": type}})
    if year_from is not None:
        conditions.append({"year": {"greater_than_equal": year_from}})
    if year_to is not None:
        conditions.append({"year": {"less_than_equal": year_to}})
    if author:
        conditions.append({"authors.name": {"like": author}})

    docs = payload_api.find(
        "publications", where={"and": conditions}, limit=len(ranked_ids)
    )["docs"]
    by_id = {doc["id"]: doc for doc in docs}

    # Preserve fused order; attach a descending rank score for the UI.
    ordered = [pid for pid in ranked_ids if pid in by_id][:limit]
    results = [
        {"score": round(1.0 - i / max(len(ordered), 1), 4), "publication": by_id[pid]}
        for i, pid in enumerate(ordered)
    ]
    return {"query": q, "results": results}


@router.get("/search/all")
def search_all(q: str, limit: int = 10, types: str | None = None) -> dict:
    """Cross-entity public search over CMS entities.

    Uses multi-entity semantic search where embeddings exist, then fills gaps with
    lexical matching so newer entity types remain searchable before reindexing.
    """
    if len(q) > 500 or not q.strip():
        raise HTTPException(400, "query must be 1..500 chars")
    limit = max(1, min(limit, 50))
    from app import embeddings as emb
    from app.entities import ENTITY_ADAPTERS, PUBLISHED_ONLY, lexical_to_text

    allowed_types = set(ENTITY_ADAPTERS)

    type_list = None
    if types:
        type_list = [t for t in types.split(",") if t in allowed_types]

    selected_types = type_list or sorted(allowed_types)
    hits = []
    try:
        hits = emb.search_entities(q, types=selected_types, limit=limit * 4)
    except Exception as err:
        logger.warning("cross-entity semantic search failed: %s", err)

    # Resolve documents per entity type (one query each), enforcing visibility.
    by_type: dict[str, list[int]] = {}
    for etype, eid, _ in hits:
        by_type.setdefault(etype, []).append(eid)

    resolved: dict[tuple[str, int], dict] = {}
    for etype, ids in by_type.items():
        conditions: list[dict] = [{"id": {"in": ids}}]
        if etype in PUBLISHED_ONLY:
            conditions.append({"status": {"equals": "published"}})
        where = {"and": conditions} if len(conditions) > 1 else conditions[0]
        docs = payload_api.find(etype, where=where, limit=len(ids))["docs"]
        for d in docs:
            resolved[(etype, d["id"])] = {
                "entity_type": etype,
                "id": d["id"],
                # Publications/projects/theses use `title`; members use `name`.
                "title": d.get("title") or d.get("name"),
                "slug": d.get("slug"),
            }

    results = []
    seen: set[tuple[str, int]] = set()
    for etype, eid, score in hits:
        item = resolved.get((etype, eid))
        if item:
            key = (etype, eid)
            seen.add(key)
            results.append({"score": round(score, 4), "source": "semantic", **item})
        if len(results) >= limit:
            break

    if len(results) < limit:
        for item in _lexical_entity_results(q, selected_types, limit * 3, lexical_to_text):
            key = (item["entity_type"], item["id"])
            if key in seen:
                continue
            seen.add(key)
            results.append(item)
            if len(results) >= limit:
                break
    return {"query": q, "results": results}


def _lexical_entity_results(q: str, entity_types: list[str], limit: int, lexical_to_text) -> list[dict]:
    tokens = [token for token in re.findall(r"[\w\-]+", q.lower()) if len(token) > 2]
    if not tokens:
        return []

    results = []
    for entity_type in entity_types:
        where = {"status": {"equals": "published"}} if entity_type == "publications" else None
        try:
            docs = payload_api.find_all(entity_type, where=where, depth=0)
        except Exception as err:
            logger.warning("lexical entity search failed: type=%s error=%s", entity_type, err)
            continue
        for doc in docs:
            item = _entity_result_doc(entity_type, doc, lexical_to_text)
            if not item:
                continue
            haystack = f"{item.get('title') or ''} {item.get('description') or ''}".lower()
            matched = sum(1 for token in tokens if token in haystack)
            if matched == 0:
                continue
            score = min(0.99, matched / max(len(tokens), 1))
            results.append({"score": round(score, 4), "source": "lexical", **item})

    results.sort(key=lambda item: (-item["score"], item["entity_type"], item["title"] or ""))
    return results[:limit]


def _entity_result_doc(entity_type: str, doc: dict, lexical_to_text) -> dict | None:
    title = doc.get("title") or doc.get("name")
    if not title:
        return None
    description = ""
    if entity_type == "publications":
        description = doc.get("abstract") or doc.get("venue") or ""
    elif entity_type == "members":
        interests = doc.get("researchInterests") or []
        description = ", ".join(interests) if isinstance(interests, list) else str(interests or "")
    elif entity_type == "projects":
        description = lexical_to_text(doc.get("description"))
    elif entity_type == "thesis-topics":
        description = lexical_to_text(doc.get("description"))
    elif entity_type == "software":
        description = doc.get("description") or doc.get("kind") or ""
    elif entity_type == "news":
        description = lexical_to_text(doc.get("body")) or doc.get("socialSnippet") or ""
    elif entity_type == "events":
        description = lexical_to_text(doc.get("description")) or doc.get("speaker") or doc.get("location") or ""
    return {
        "entity_type": entity_type,
        "id": doc["id"],
        "title": title,
        "slug": doc.get("slug"),
        "description": description[:240] if description else None,
        "year": doc.get("year") or _year(doc.get("date")),
    }


def _year(value: object) -> int | None:
    if not isinstance(value, str) or len(value) < 4:
        return None
    try:
        return int(value[:4])
    except ValueError:
        return None


@router.get("/map")
def topic_map() -> dict:
    """Topic map: 2D publication points with clusters (cluster.py pipeline)."""
    from app import db

    try:
        with db.connect() as conn:
            rows = conn.execute(
                "SELECT publication_id, cluster_id, x, y, label FROM topic_map"
            ).fetchall()
    except Exception:
        rows = []
    if not rows:
        return {"points": [], "clusters": []}

    # Map shows only published papers (drafts/imported stay off the public map).
    pubs = {
        p["id"]: p
        for p in payload_api.find_all("publications", where={"status": {"equals": "published"}})
    }
    points = []
    clusters: dict[int, dict] = {}
    for pub_id, cluster_id, x, y, label in rows:
        pub = pubs.get(pub_id)
        if not pub:
            continue
        points.append(
            {
                "x": x,
                "y": y,
                "cluster": cluster_id,
                "publication": {
                    "id": pub_id,
                    "title": pub.get("title"),
                    "slug": pub.get("slug"),
                    "year": pub.get("year"),
                },
            }
        )
        if cluster_id != -1:
            entry = clusters.setdefault(cluster_id, {"id": cluster_id, "label": label, "count": 0})
            entry["count"] += 1
    return {"points": points, "clusters": sorted(clusters.values(), key=lambda c: -c["count"])}


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str = Field(max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    history: list[ChatTurn] = Field(default_factory=list, max_length=6)


@router.post("/chat")
def chat(req: ChatRequest, x_client_ip: str | None = Header(None)) -> dict:
    """RAG chatbot over the group's publications (brief: section A/D chatbot)."""
    from app.settings_cache import feature_enabled

    request_id = str(uuid.uuid4())
    if not feature_enabled("enableChatbot"):
        raise HTTPException(503, "the chatbot is currently disabled")
    check_chat_rate_limit(x_client_ip or "unknown")

    from app import embeddings  # lazy import: pulls in torch

    hits = embeddings.search_publications(req.message, limit=6)
    ids = [pub_id for pub_id, _ in hits]
    # Ground the chatbot only in published papers (never leak drafts/imported).
    docs = (
        payload_api.find(
            "publications",
            where={"and": [{"id": {"in": ids}}, {"status": {"equals": "published"}}]},
            limit=len(ids),
        )["docs"]
        if ids
        else []
    )
    by_id = {d["id"]: d for d in docs}
    sources = []
    context_lines = []
    for n, (pub_id, _score) in enumerate(hits, start=1):
        pub = by_id.get(pub_id)
        if not pub:
            continue
        summary = (pub.get("aiSummary") or {}).get("tldr") or (pub.get("abstract") or "")[:400]
        context_lines.append(f"[{n}] {pub.get('title')} ({pub.get('year')}). {summary}")
        sources.append(
            {"n": n, "title": pub.get("title"), "slug": pub.get("slug"), "year": pub.get("year")}
        )

    history_text = "\n".join(
        f"{'Visitor' if t.role == 'user' else 'Assistant'}: {t.content[:300]}"
        for t in req.history[-6:]
    ) or "(start of conversation)"

    try:
        answer = complete(
            load_prompt(
                "chat",
                context="\n".join(context_lines) or "(no relevant publications found)",
                history=history_text,
                question=req.message,
            ),
            request_id=request_id,
        )
    except LLMError as err:
        err.request_id = err.request_id or request_id
        return llm_error_response(err)
    # LLM output over untrusted inputs — plain text, capped
    return {"answer": str(answer)[:3000], "sources": sources, "requestId": request_id}


class ProcessRequest(BaseModel):
    id: int


@router.post("/process/publication")
def process_publication(req: ProcessRequest, x_service_token: str | None = Header(None)) -> dict:
    """Process one publication: summary (if it has an abstract and status none) + embedding.

    Called automatically by the Payload hook when a publication is added/edited.
    Idempotent: does not regenerate an already generated or edited summary.
    """
    require_service_token(x_service_token)
    from app import embeddings  # lazy import: pulls in torch
    from app.pipelines.summarize import summarize_publication_result
    from app.settings_cache import feature_enabled

    docs = payload_api.find("publications", where={"id": {"equals": req.id}}, limit=1)["docs"]
    if not docs:
        raise HTTPException(404, f"publications/{req.id} not found")
    pub = docs[0]

    summarized = False
    if (
        feature_enabled("enableSummaries")
        and (pub.get("abstract") or "").strip()
        and pub.get("aiSummaryStatus") == "none"
    ):
        update_data = summarize_publication_result(pub)
        payload_api.update(
            "publications", pub["id"], {**update_data, "aiSummaryStatus": "generated"}
        )
        summarized = True

    embedded = False
    text = f"{pub.get('title') or ''}\n\n{pub.get('abstract') or ''}".strip()
    if text:
        embeddings.upsert_publication_embeddings([(pub["id"], text)])
        embedded = True

    return {"id": req.id, "summarized": summarized, "embedded": embedded}


class SnippetRequest(BaseModel):
    collection: str  # "publications" | "news"
    id: int
    save: bool = True


@router.post("/generate/snippet")
def generate_snippet(req: SnippetRequest, x_service_token: str | None = Header(None)) -> dict:
    """Generate LinkedIn/X post text for a publication or news item."""
    require_service_token(x_service_token)
    if req.collection not in ("publications", "news"):
        raise HTTPException(400, "collection must be 'publications' or 'news'")

    docs = payload_api.find(req.collection, where={"id": {"equals": req.id}}, limit=1)["docs"]
    if not docs:
        raise HTTPException(404, f"{req.collection}/{req.id} not found")
    doc = docs[0]

    if req.collection == "publications":
        details = f"{doc.get('venue') or ''} {doc.get('year') or ''}. {doc.get('abstract') or ''}"
        kind = "research paper"
    else:
        details = str(doc.get("title") or "")
        kind = "news item"

    data = complete_json(
        load_prompt("snippet", kind=kind, title=doc.get("title") or "", details=details[:2000])
    )
    # The LLM output is built on external data (OpenAlex abstracts), so we treat
    # it as untrusted: store as plain text and cap the length
    linkedin = str(data.get("linkedin", ""))[:1500]
    x_post = str(data.get("x", ""))[:300]
    snippet = f"LinkedIn:\n{linkedin}\n\nX:\n{x_post}"

    if req.save:
        payload_api.update(req.collection, req.id, {"socialSnippet": snippet})

    return {"snippet": snippet, **data}


class IngestLookupRequest(BaseModel):
    # DOI, DOI URL, OpenAlex work id/URL, landing URL, or a plain title.
    identifier: str = Field(min_length=3, max_length=500)


@router.post("/ingest/lookup")
def ingest_lookup(req: IngestLookupRequest, x_service_token: str | None = Header(None)) -> dict:
    """Resolve an identifier to a publication preview WITHOUT creating anything.

    Powers the admin "Import publication" form: paste a DOI/URL/title, see a
    preview + a duplicate warning, then decide. Human-in-the-loop by design.
    """
    require_service_token(x_service_token)
    from app.pipelines.ingest import resolve_publication

    pub, duplicate = resolve_publication(req.identifier)
    if not pub:
        return {"found": False, "publication": None, "duplicate": None}
    dup = (
        {
            "id": duplicate["id"],
            "title": duplicate.get("title"),
            "status": duplicate.get("status"),
            "slug": duplicate.get("slug"),
        }
        if duplicate
        else None
    )
    return {"found": True, "publication": pub, "duplicate": dup}


@router.post("/ingest/create")
def ingest_create(req: IngestLookupRequest, x_service_token: str | None = Header(None)) -> dict:
    """Create a draft publication (status pending_review) from an identifier.

    Called after a human approves the preview. Never publishes — the new paper
    enters the editorial review queue (see upsert_publication).
    """
    require_service_token(x_service_token)
    from app.pipelines.ingest import resolve_publication

    pub, duplicate = resolve_publication(req.identifier)
    if not pub:
        raise HTTPException(404, "no publication found for that identifier")

    doc, created = payload_api.upsert_publication(pub)
    return {
        "id": doc["id"],
        "slug": doc.get("slug"),
        "status": doc.get("status"),
        "created": created,
        "duplicateOf": duplicate["id"] if duplicate and not created else None,
    }


@router.get("/maintenance/report")
def maintenance_report(
    check_links: bool = False, x_service_token: str | None = Header(None)
) -> dict:
    """Data-health report for admins (missing embeddings, duplicates, broken links…).

    Read-only: it never edits content. Link-checking is opt-in (slow, network).
    """
    require_service_token(x_service_token)
    from app.pipelines.maintenance import run_checks

    return run_checks(check_links=check_links)


@router.post("/rag/answer")
def rag_answer(req: RagRequest, x_service_token: str | None = Header(None)) -> dict:
    """Admin-only RAG endpoint.

    Frontend/admin code should use the Next.js facade at /api/rag.
    """
    require_service_token(x_service_token)
    try:
        return answer_question(req).model_dump()
    except LLMError as err:
        return llm_error_response(err)
