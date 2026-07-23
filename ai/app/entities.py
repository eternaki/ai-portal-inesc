"""Entity → embedding-text adapters for the multi-entity embedding pipeline.

Each Payload collection that we want to make semantically searchable defines one
small function: given a document, return the plain text to embed. This is the ONLY
type-specific code — storage, hashing, and search are generic (see embeddings.py).

Short entities (a name, a title) embed poorly alone, so member/project/thesis text
is enriched with bio / interests / description to give the vector real signal.
"""

from typing import Any, Callable


def lexical_to_text(node: Any) -> str:
    """Flatten a Payload Lexical richText value into plain text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return " ".join(lexical_to_text(n) for n in node)
    if isinstance(node, dict):
        parts: list[str] = []
        text = node.get("text")
        if isinstance(text, str):
            parts.append(text)
        if "root" in node:
            parts.append(lexical_to_text(node["root"]))
        if "children" in node:
            parts.append(lexical_to_text(node["children"]))
        return " ".join(p for p in parts if p)
    return ""


def _join(*parts: str) -> str:
    return "\n".join(p.strip() for p in parts if p and p.strip()).strip()


def _publication_text(d: dict) -> str:
    return _join(d.get("title") or "", d.get("abstract") or "")


def _member_text(d: dict) -> str:
    interests = d.get("researchInterests") or []
    interests_s = ", ".join(interests) if isinstance(interests, list) else str(interests or "")
    return _join(
        d.get("name") or "",
        d.get("role") or "",
        lexical_to_text(d.get("bio")),
        interests_s,
        d.get("careerTrajectory") or "",
    )


def _project_text(d: dict) -> str:
    return _join(d.get("title") or "", lexical_to_text(d.get("description")))


def _thesis_text(d: dict) -> str:
    return _join(d.get("title") or "", lexical_to_text(d.get("description")))


def _software_text(d: dict) -> str:
    return _join(d.get("name") or "", d.get("kind") or "", d.get("description") or "")


def _news_text(d: dict) -> str:
    return _join(d.get("title") or "", lexical_to_text(d.get("body")), d.get("socialSnippet") or "")


def _event_text(d: dict) -> str:
    return _join(d.get("title") or "", d.get("speaker") or "", d.get("location") or "", lexical_to_text(d.get("description")))


def _reading_group_text(d: dict) -> str:
    return _join(d.get("title") or "", d.get("presenter") or "", d.get("paperTitle") or "", lexical_to_text(d.get("description")))


# Keyed by Payload collection slug (also used as the entity_type in the DB).
ENTITY_ADAPTERS: dict[str, Callable[[dict], str]] = {
    "publications": _publication_text,
    "members": _member_text,
    "projects": _project_text,
    "thesis-topics": _thesis_text,
    "software": _software_text,
    "news": _news_text,
    "events": _event_text,
    "reading-groups": _reading_group_text,
}

# Publications are the only type gated by the editorial workflow; the rest are
# public content. Used by the pipeline (what to embed) and search (what to show).
PUBLISHED_ONLY = {"publications"}
