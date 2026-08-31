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
from app.llm.fallback import MODE_EXTRACTIVE, MODE_LLM  # noqa: F401 - re-exported for callers
from app.rag.safety import detect_prompt_injection, sanitize_text
from app.collection_intent import LIST_SORT, named_collection
from app.timeframe import extract_timeframe

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


# Where each kind of entry keeps its date. Anything absent here is undated: a
# member or a dissertation is not an event in a year, so a question about a period
# cannot be answered with one.
_DATE_FIELDS = {
    "publications": ("publicationDate", "year"),
    "events": ("date",),
    "news": ("date",),
}


def _entry_year(entity_type: str, doc: dict) -> int | None:
    for field in _DATE_FIELDS.get(entity_type, ()):
        value = doc.get(field)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and len(value) >= 4 and value[:4].isdigit():
            return int(value[:4])
    return None


def _find_by_timeframe(timeframe, max_sources: int) -> list[tuple[str, dict]]:
    """Entries from the period itself, newest first, ignoring similarity.

    For a question that is *only* a period — "what did the group publish in
    2024?", "papers between 2020 and 2022" — there is no topic to rank by. With
    the date removed the text is "what did the group publish?", which resembles
    nothing in particular and scores 0.37; the period is the whole query, so it
    has to be the thing we query on.

    Used only when the semantic path returns nothing inside the window, so a
    question that *does* name a topic still gets ranked by that topic.
    """
    found: list[tuple[str, dict]] = []
    for etype in ("publications", "events", "news"):
        if etype == "publications":
            where: dict[str, Any] = {
                "and": [
                    {"year": {"greater_than_equal": timeframe.start}},
                    {"year": {"less_than_equal": timeframe.end}},
                    {"status": {"equals": "published"}},
                ]
            }
            sort = "-year"
        else:
            where = {
                "and": [
                    {"date": {"greater_than_equal": f"{timeframe.start}-01-01"}},
                    {"date": {"less_than_equal": f"{timeframe.end}-12-31"}},
                ]
            }
            sort = "-date"
        try:
            docs = payload_api.find(etype, where=where, limit=max_sources, sort=sort)["docs"]
        except Exception as err:  # noqa: BLE001 - one collection must not kill the answer
            logger.warning("chat could not list %s for the period: %s", etype, err)
            continue
        found.extend((etype, doc) for doc in docs)
    return found[: max_sources * 2]


def _list_collection(entity_type: str, max_sources: int) -> list[tuple[str, dict]]:
    """A section of the site, in its own order, for a question that asks to see it.

    "What projects is the group involved in?" names a section and asks for its
    contents. Similarity has nothing to rank that by — there is no vector for "all
    of them" — so it scored 0.39 and was refused with nine projects in the CMS.
    """
    where = {"status": {"equals": "published"}} if entity_type in _PUBLISHED_ONLY else None
    try:
        docs = payload_api.find(
            entity_type, where=where, limit=max_sources, sort=LIST_SORT.get(entity_type)
        )["docs"]
    except Exception as err:  # noqa: BLE001 - listing must not 500 the chat
        logger.warning("chat could not list %s: %s", entity_type, err)
        return []
    return [(entity_type, doc) for doc in docs]


def _as_source(entity_type: str, doc: dict, position: int, score: float = 0.0) -> dict | None:
    """One citation, or None when its text carries instructions aimed at the model."""
    text = _describe(entity_type, doc)
    if detect_prompt_injection(text):
        return None
    return {
        "n": position,
        "entity_type": entity_type,
        "id": doc["id"],
        "title": doc.get("title") or doc.get("name"),
        "slug": doc.get("slug"),
        "url": source_url(entity_type, doc),
        "year": _entry_year(entity_type, doc),
        "score": round(float(score), 4),
        "text": text,
    }


def gather_sources(
    query: str, *, limit: int | None = None, history_queries: list[str] | None = None
) -> tuple[list[dict], list[str]]:
    """Retrieve grounded, visible, injection-screened sources for a question.

    Returns (sources, warnings). Each source carries the citation number it will
    be cited by — numbering happens *after* filtering, so a dropped hit can't
    leave a gap like "[1] [3]" in the answer.

    `history_queries` are the visitor's earlier questions in this conversation.
    They are only consulted when the current message finds nothing on its own:
    a follow-up like "can you give me more information" carries no topic, so its
    vector matches nothing and the bot refused mid-conversation. Retrying with
    the previous question's text restores the topic without polluting retrieval
    for messages that stand on their own.
    """
    from app import embeddings  # lazy: pulls in torch

    settings = get_settings()
    max_sources = limit or settings.chat_max_sources
    warnings: list[str] = []

    # A period is a filter, never a similarity: "2019" and "2024" look alike to a
    # vector, so asking about one year would happily return the other. Taking it
    # out of the text first is also what makes the rest of the question findable —
    # "reading group in March 2024" embeds as neither a reading group nor a date,
    # and used to score 0.37 against a 0.40 floor with 83 dated events in the CMS.
    search_text, timeframe = extract_timeframe(query)
    # Both are structured answers the CMS can give when similarity cannot, so both
    # have to be known before the early return below — otherwise a question with
    # no semantic match is refused before either gets a chance.
    listable = named_collection(query)
    # Over-fetch harder when filtering by date, or the window eats the whole page.
    over_fetch = max_sources * (12 if timeframe else 4)

    try:
        hits = embeddings.search_entities(
            search_text, types=list(CHAT_ENTITY_TYPES), limit=over_fetch
        )
    except Exception as err:  # noqa: BLE001 - retrieval failure must not 500 the chat
        logger.warning("chat retrieval failed: %s", err)
        return [], ["retrieval unavailable"]

    # Drop weak matches before spending an LLM call on them. Without this the
    # chatbot cites whatever came back, however unrelated.
    strong = [(t, i, s) for t, i, s in hits if s >= settings.chat_min_semantic_score]

    # Topicless follow-up: retry with the conversation's earlier questions, newest
    # first, stopping at the first that retrieves something.
    if not strong and not timeframe and not listable and history_queries:
        for prev in reversed(history_queries):
            prev_text, _ = extract_timeframe(prev)
            combined = f"{prev_text} {search_text}".strip()
            if not combined or combined == search_text:
                continue
            try:
                hits = embeddings.search_entities(
                    combined, types=list(CHAT_ENTITY_TYPES), limit=over_fetch
                )
            except Exception as err:  # noqa: BLE001 - same contract as above
                logger.warning("chat follow-up retrieval failed: %s", err)
                break
            strong = [(t, i, s) for t, i, s in hits if s >= settings.chat_min_semantic_score]
            if strong:
                break

    if not strong and not timeframe and not listable:
        return [], warnings
    # An empty semantic result is not the end when the question named a period or a
    # section: it may never have been about a subject at all, and the CMS can answer
    # it directly. See the fallback at the end.

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
        if timeframe and not timeframe.contains_year(_entry_year(etype, doc)):
            # Undated entries fall out here too, and should: a member has no year,
            # so nothing about them answers "what happened in 2024".
            continue
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
                # _entry_year, not doc["year"]: events and news date themselves
                # with `date`, so reading `year` left their citations undated.
                "year": _entry_year(etype, doc),
                "score": round(float(score), 4),
                "text": text,
            }
        )
        if len(sources) >= max_sources:
            break

    # Nothing matched by meaning. Before refusing, check whether the question was
    # never about a subject at all: a period ("what did they publish in 2024?") or
    # a section ("what projects is the group involved in?"). Both are answerable
    # from the CMS directly, and both used to be refused with the answer sitting
    # in the database. Only when similarity found nothing, so a question that does
    # name a subject is still ranked by that subject.
    if not sources:
        if timeframe:
            fallback = _find_by_timeframe(timeframe, max_sources)
        else:
            fallback = _list_collection(listable, max_sources) if listable else []
        for etype, doc in fallback:
            source = _as_source(etype, doc, len(sources) + 1)
            if source:
                sources.append(source)
            if len(sources) >= max_sources:
                break

    return sources, warnings


def has_enough_evidence(sources: list[dict]) -> bool:
    return len(sources) >= get_settings().chat_min_evidence_sources


# How the answer was produced, reported to the caller so the UI can label it
# honestly. The two working modes come from llm.fallback so that a pipeline's
# provenance stamp and this endpoint's `mode` field cannot drift apart; "none" is
# local to the chat — the refusal, where there was no evidence to answer from and
# so nothing was produced by either layer.
MODE_NONE = "none"
# The question itself carried an instruction aimed at the model. Distinct from
# "none" so the widget can say what actually happened instead of claiming the
# archive had nothing on it.
MODE_REFUSED = "refused"

# Retrieval never needed a model: embeddings run locally, so by the time the chat
# reaches the LLM it already holds grounded, screened, ranked entries. Losing the
# provider should therefore cost the phrasing, not the answer — the same two-layer
# shape pipelines/extractive.py gives summaries, where the deterministic draft is
# always available and the LLM only refines it.
EXTRACTIVE_PREAMBLE = (
    "No language model is available right now, so this is what the group's own "
    "material matched — the entries themselves, closest first, rather than a "
    "written answer:"
)

SNIPPET_CHARS = 240


def _snippet(text: str, limit: int = SNIPPET_CHARS) -> str:
    """The leading `limit` characters, cut at a word boundary."""
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return f"{text[:limit].rsplit(' ', 1)[0].rstrip(' ,;:.')}…"


def extractive_answer(sources: list[dict]) -> str:
    """Assemble an answer from the retrieved entries alone, with no model.

    Deliberately does not join two entries into a statement: relating sources to
    each other is the part that needs a model, and the part that invents things.
    So this lists what matched and quotes it, and the preamble says plainly that
    it is a match list — presenting it as a reasoned answer would be the one
    dishonest outcome available here.
    """
    if not sources:
        return ""

    lines = [EXTRACTIVE_PREAMBLE, ""]
    for source in sources:
        year = f" ({source['year']})" if source.get("year") else ""
        snippet = _snippet(source.get("text") or "")
        lines.append(
            f"[{source['n']}] {_kind(source['entity_type'])}{year} — "
            f"{source['title']}.{f' {snippet}' if snippet else ''}"
        )
    return "\n".join(lines)


def public_sources(sources: list[dict]) -> list[dict]:
    """The citation list as the browser may see it.

    `text` is prompt-only context and `score` is an internal ranking number, so
    both are dropped. A capped `snippet` takes their place because in extractive
    mode that line *is* the answer — and it is safe to expose: gather_sources has
    already sanitised it and screened it for injection, and it comes from pages
    the visitor can open anyway.
    """
    return [
        {
            **{k: v for k, v in source.items() if k not in ("text", "score")},
            "snippet": _snippet(source.get("text") or ""),
        }
        for source in sources
    ]


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
