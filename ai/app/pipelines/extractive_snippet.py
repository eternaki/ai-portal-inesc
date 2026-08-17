"""Deterministic, LLM-free social post drafts.

The third of the offline layers, next to extractive.py (summaries) and
extractive_bio.py (people). `/generate/snippet` used to raise without a provider,
so the admin's "generate post" button returned a 503 and the editor got nothing —
on a feature whose whole job is to save them typing a sentence they could write
themselves.

A post assembled from the record is a worse post than a model writes and a much
better one than no post: an editor edits it in the box they are already looking
at. It states only what the record holds, and never guesses at significance.
"""

from __future__ import annotations

import re

GROUP = "MLKD @ INESC-ID"

# X's limit is 280; leave room for the URL the editor may paste and for the
# platform's own link shortening, rather than shipping a post that cannot send.
X_LIMIT = 240
LINKEDIN_SENTENCE_LIMIT = 320


def _clean(text: str) -> str:
    return " ".join(str(text or "").split())


def _first_sentence(text: str, limit: int = LINKEDIN_SENTENCE_LIMIT) -> str:
    """The opening sentence of an abstract, trimmed at a word boundary."""
    text = _clean(text)
    if not text:
        return ""
    # `match` is the space *after* the full stop, so slice to its start — taking
    # one more character carries the space into the post and shows up as a gap
    # before whatever is appended next.
    match = re.search(r"(?<=[.!?])\s", text)
    sentence = text[: match.start()] if match else text
    if len(sentence) <= limit:
        return sentence
    return f"{sentence[:limit].rsplit(' ', 1)[0].rstrip(' ,;:.')}…"


def _link(doc: dict) -> str:
    """Something a reader can click.

    `doi` is stored bare ("10.48550/arxiv.2603.00181"), which pasted into a post
    is not a link at all — it has to be resolved through doi.org. The open-access
    URL is preferred where ingest found one, for the same reason it is preferred
    on the site: doi.org usually lands on the publisher's paywall.
    """
    url = _clean(doc.get("originalUrl"))
    if url:
        return url
    doi = _clean(doc.get("doi"))
    if not doi:
        return ""
    return doi if doi.startswith("http") else f"https://doi.org/{doi}"


def _fit(text: str, limit: int) -> str:
    text = _clean(text)
    if len(text) <= limit:
        return text
    return f"{text[:limit].rsplit(' ', 1)[0].rstrip(' ,;:.')}…"


def extractive_snippet(kind: str, doc: dict) -> dict[str, str]:
    """{"linkedin": ..., "x": ...} built from the record alone.

    `kind` is "research paper" or "news item", matching the LLM prompt's own
    vocabulary so both layers describe the same thing the same way.
    """
    title = _clean(doc.get("title"))
    url = _link(doc)

    if kind == "research paper":
        venue = _clean(doc.get("venue"))
        year = doc.get("year")
        # "in Nature (2024)" / "in Nature" / "(2024)" / nothing — never a stray
        # bracket or a dangling preposition when a field is missing.
        where = " ".join(part for part in (f"in {venue}" if venue else "", f"({year})" if year else "") if part)
        opening = f"New publication from the {GROUP} group: {title}"
        lead = f"{opening} {where}." if where else f"{opening}."
        body = _first_sentence(doc.get("abstract") or "")
    else:
        lead = f"News from the {GROUP} group: {title}."
        body = _first_sentence(doc.get("excerpt") or doc.get("summary") or "")

    linkedin = " ".join(part for part in (lead, body, url) if part)
    x_post = _fit(f"{title} — {GROUP}", X_LIMIT)
    if url and len(x_post) + len(url) + 1 <= X_LIMIT + len(url):
        x_post = f"{x_post} {url}"

    return {"linkedin": linkedin, "x": x_post}
