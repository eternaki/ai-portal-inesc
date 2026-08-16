"""Grounding for the public chatbot: what it is allowed to answer from.

The chat used to retrieve six publications and hand them to the model no matter
how weak the match — with zero results it still called the LLM and trusted the
prompt to refuse. It also searched publications only, so questions about people,
projects or dissertations had nothing to stand on, and it fed raw OpenAlex
abstracts into the prompt without screening them.

This module fixes those three things, reusing what the admin RAG already does:
retrieve across every entity type, drop weak matches, screen retrieved text for
prompt injection, and report honestly when the evidence is too thin to answer.
The HTTP layer stays a thin wrapper in api/routes.py.
"""

import logging
from typing import Any

from app import payload_api
from app.config import get_settings
from app.rag.safety import detect_prompt_injection, sanitize_text

logger = logging.getLogger(__name__)

# Entity types the public chat may ground in, mapped to the public page a visitor
# can open. Types with a detail route link to the document; the rest link to their
# list page, because a citation that goes nowhere is worse than a coarse one.
_DETAIL_ROUTES = {
    "publications": "/publications/{slug}",
    "dissertations": "/dissertations/{slug}",
    "members": "/people/{slug}",
    "news": "/news/{slug}",
}
_LIST_ROUTES = {
    "projects": "/projects",
    "software": "/software",
    "events": "/events",
}
CHAT_ENTITY_TYPES = tuple(sorted({*_DETAIL_ROUTES, *_LIST_ROUTES}))

# Publications are the only collection with an editorial workflow; everything else
# is public as soon as it exists. Filtering `status` on a collection that has no
# such field makes Payload reject the query outright (400), silently dropping that
# entity type from every answer.
_PUBLISHED_ONLY = {"publications"}


def source_url(entity_type: str, doc: dict) -> str:
    slug = doc.get("slug")
    route = _DETAIL_ROUTES.get(entity_type)
    if route and slug:
        return route.format(slug=slug)
    return _LIST_ROUTES.get(entity_type, "/search")


def _describe(entity_type: str, doc: dict) -> str:
    """One line of evidence for the prompt, sanitised.

    Prefers the human/AI summary over the raw abstract so the model reads the
    group's own framing first.
    """
    if entity_type == "publications":
        text = (doc.get("aiSummary") or {}).get("tldr") or doc.get("abstract") or ""
    elif entity_type == "members":
        text = doc.get("bio") or doc.get("bioAiDraft") or ""
    else:
        text = doc.get("description") or doc.get("abstract") or doc.get("body") or ""
    return sanitize_text(text, max_chars=400)


def gather_sources(query: str, *, limit: int | None = None) -> tuple[list[dict], list[str]]:
    """Retrieve grounded, visible, injection-screened sources for a question.

    Returns (sources, warnings). Each source carries the citation number it will
    be cited by — numbering happens *after* filtering, so a dropped hit can't
    leave a gap like "[1] [3]" in the answer.
    """
    from app import embeddings  # lazy: pulls in torch

    settings = get_settings()
    max_sources = limit or settings.chat_max_sources
    warnings: list[str] = []

    try:
        hits = embeddings.search_entities(
            query, types=list(CHAT_ENTITY_TYPES), limit=max_sources * 4
        )
    except Exception as err:  # noqa: BLE001 - retrieval failure must not 500 the chat
        logger.warning("chat retrieval failed: %s", err)
        return [], ["retrieval unavailable"]

    # Drop weak matches before spending an LLM call on them. Without this the
    # chatbot cites whatever came back, however unrelated.
    strong = [(t, i, s) for t, i, s in hits if s >= settings.chat_min_semantic_score]
    if not strong:
        return [], warnings

    by_type: dict[str, list[int]] = {}
    for etype, eid, _ in strong:
        by_type.setdefault(etype, []).append(eid)

    resolved: dict[tuple[str, int], dict] = {}
    for etype, ids in by_type.items():
        conditions: list[dict[str, Any]] = [{"id": {"in": ids}}]
        if etype in _PUBLISHED_ONLY:
            conditions.append({"status": {"equals": "published"}})
        where = {"and": conditions} if len(conditions) > 1 else conditions[0]
        try:
            docs = payload_api.find(etype, where=where, limit=len(ids))["docs"]
        except Exception as err:  # noqa: BLE001 - one bad collection shouldn't kill the answer
            logger.warning("chat could not resolve %s: %s", etype, err)
            continue
        for doc in docs:
            resolved[(etype, doc["id"])] = doc

    sources: list[dict] = []
    for etype, eid, score in strong:
        doc = resolved.get((etype, eid))
        if not doc:
            continue  # unpublished or unresolvable — never cite it
        text = _describe(etype, doc)
        # Retrieved text is untrusted: an abstract could carry instructions aimed
        # at the model. The admin RAG already screens for this; so does chat now.
        if detect_prompt_injection(text):
            warnings.append(f"excluded {etype}/{eid}: suspicious instructions in source text")
            continue
        sources.append(
            {
                "n": len(sources) + 1,
                "entity_type": etype,
                "id": eid,
                "title": doc.get("title") or doc.get("name"),
                "slug": doc.get("slug"),
                "url": source_url(etype, doc),
                "year": doc.get("year"),
                "score": round(float(score), 4),
                "text": text,
            }
        )
        if len(sources) >= max_sources:
            break

    return sources, warnings


def has_enough_evidence(sources: list[dict]) -> bool:
    return len(sources) >= get_settings().chat_min_evidence_sources


def _kind(entity_type: str) -> str:
    """"publications" -> "publication", so the prompt reads naturally."""
    return entity_type[:-1] if entity_type.endswith("s") else entity_type


def context_block(sources: list[dict]) -> str:
    """The numbered evidence the prompt cites, one line per source.

    The entity kind is stated explicitly so the model can tell a person from a
    paper — it now sees both, and answering "who works on X" from a paper title
    would be wrong.
    """
    lines = []
    for s in sources:
        year = f" ({s['year']})" if s.get("year") else ""
        lines.append(f"[{s['n']}] {_kind(s['entity_type'])}: {s['title']}{year}. {s['text']}")
    return "\n".join(lines)
