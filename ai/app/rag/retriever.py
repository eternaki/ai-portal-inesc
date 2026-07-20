import math
import re
from app import payload_api
from app.config import get_settings
from app.rag.models import RagSource
from app.rag.safety import detect_prompt_injection, sanitize_text

DEFAULT_SCOPE = ["publications", "members", "projects", "news", "software", "thesisTopics"]
SCOPE_MAP = {
    "publications": "publications",
    "members": "members",
    "projects": "projects",
    "news": "news",
    "software": "software",
    "thesisTopics": "thesis-topics",
    "thesis-topics": "thesis-topics",
}


def retrieve_sources(question: str, scope: list[str], limit: int | None = None) -> tuple[list[RagSource], list[str]]:
    settings = get_settings()
    clean_scope = [SCOPE_MAP[item] for item in (scope or DEFAULT_SCOPE) if item in SCOPE_MAP]
    if not clean_scope:
        clean_scope = [SCOPE_MAP[item] for item in DEFAULT_SCOPE]

    warnings: list[str] = []
    sources: list[RagSource] = []
    for collection in clean_scope:
        where = {"status": {"equals": "published"}} if collection == "publications" else None
        for doc in payload_api.find_all(collection, where=where, depth=0):
            source = _source_from_doc(collection, doc)
            if not source:
                continue
            if detect_prompt_injection(source.text):
                warnings.append(f"Potential prompt injection pattern found in {collection}/{source.id}.")
            source.score = lexical_score(question, source)
            if source.score >= settings.rag_min_source_score:
                sources.append(source)

    sources.sort(key=lambda item: (-item.score, item.year is None, -(item.year or 0), item.title))
    return sources[: max(1, min(limit or settings.rag_max_sources, settings.rag_max_sources))], warnings


def lexical_score(question: str, source: RagSource) -> float:
    tokens = _tokens(question)
    if not tokens:
        return 0.0
    haystack = f"{source.title} {source.text}".lower()
    matched = sum(1 for token in tokens if token in haystack)
    phrase_bonus = 1 if question.strip().lower() in haystack else 0
    return min(1.0, (matched / math.sqrt(len(tokens) * 12)) + phrase_bonus * 0.3)


def _tokens(value: str) -> list[str]:
    return [token for token in re.findall(r"[\w\-]+", value.lower()) if len(token) > 2]


def _source_from_doc(collection: str, doc: dict) -> RagSource | None:
    if collection == "publications":
        title = doc.get("title") or ""
        text = "\n".join(
            [
                sanitize_text(doc.get("abstract")),
                sanitize_text(doc.get("venue")),
                sanitize_text(doc.get("aiSummary")),
            ]
        )
        if not title or not text.strip():
            return None
        return RagSource(
            id=doc["id"],
            type="publication",
            title=title,
            text=text,
            url=_url("publications", doc),
            year=_int(doc.get("year")),
            doi=doc.get("doi"),
            openalexId=doc.get("openalexId"),
        )

    if collection == "members":
        title = doc.get("name") or ""
        text = "\n".join(
            [
                sanitize_text(doc.get("bio")),
                sanitize_text(doc.get("bioAiDraft")),
                sanitize_text(doc.get("researchInterests")),
                sanitize_text(doc.get("role")),
            ]
        )
        if not title or not text.strip():
            return None
        return RagSource(id=doc["id"], type="member", title=title, text=text, url=_url("people", doc))

    if collection == "projects":
        title = doc.get("title") or ""
        text = "\n".join(
            [
                sanitize_text(doc.get("description")),
                sanitize_text(doc.get("funding")),
                sanitize_text(doc.get("kind")),
            ]
        )
        if not title or not text.strip():
            return None
        return RagSource(
            id=doc["id"],
            type="project",
            title=title,
            text=text,
            url=_url("projects", doc),
            year=_int(doc.get("yearStart")),
        )

    if collection == "news":
        title = doc.get("title") or ""
        text = sanitize_text(doc.get("body"))
        if not title or not text:
            return None
        return RagSource(id=doc["id"], type="news", title=title, text=text, url=_url("news", doc), year=_year(doc.get("date")))

    if collection == "software":
        title = doc.get("name") or ""
        text = "\n".join([sanitize_text(doc.get("description")), sanitize_text(doc.get("kind"))])
        if not title or not text.strip():
            return None
        return RagSource(id=doc["id"], type="software", title=title, text=text, url=_url("software", doc))

    if collection == "thesis-topics":
        title = doc.get("title") or ""
        text = "\n".join([sanitize_text(doc.get("description")), sanitize_text(doc.get("level")), sanitize_text(doc.get("status"))])
        if not title or not text.strip():
            return None
        return RagSource(id=doc["id"], type="thesisTopic", title=title, text=text, url=_url("opportunities", doc))

    return None


def _url(section: str, doc: dict) -> str:
    slug = doc.get("slug")
    if section in ("publications", "news") and slug:
        return f"/{section}/{slug}"
    return f"/{section}"


def _int(value: object) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _year(value: object) -> int | None:
    if not isinstance(value, str) or len(value) < 4:
        return None
    return _int(value[:4])
