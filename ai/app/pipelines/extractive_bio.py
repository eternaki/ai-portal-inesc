"""Deterministic, LLM-free bio drafts.

The counterpart to pipelines/extractive.py, for people rather than papers: the
baseline layer the bio pipeline always has, which a model only refines. Without
it `bios.py` needed a provider to produce anything at all, and with no provider
configured all 113 drafts on the site said "Member of the MLKD research group".

Everything here is assembled from records the site already holds — the person's
role, and the publications linked to them. It states no fact it cannot point at.

One phrasing rule is load-bearing. Publication counts are attributed to *the
site*, never to the person: our corpus is partial by construction (that is what
the coverage report exists to measure), so "the site lists 11 of their
publications" is true where "they have published 11 papers" would be a claim we
cannot support and would understate a career. The same care applies to tense —
a member who has completed their time here is described in the past.
"""

from __future__ import annotations

from collections import Counter

GROUP = "the Machine Learning and Knowledge Discovery group at INESC-ID"

# The article is part of the label, not computed from it: English picks "a" or
# "an" by how a word is *said*, and the two roles here disagree with their own
# spelling in opposite directions — "an MSc" (em-ess-see) but "a PhD" (pee-aitch-dee).
# No rule over letters gets both right.
ROLE_LABELS = {
    "faculty": "a faculty member",
    "researcher": "a researcher",
    "phd": "a PhD student",
    "msc": "an MSc student",
    "alumni": "a former member",
}

# Venue strings OpenAlex uses when it does not actually know the venue. Naming one
# of these as a person's regular publishing home would be worse than saying nothing.
_EMPTY_VENUES = {"", "unknown venue", "unknown", "n/a", "none"}


def role_label(member: dict) -> str:
    """The role without its article — "an MSc student" -> "MSc student".

    For callers that need the bare noun phrase, such as the LLM prompt, which
    builds its own sentence around it.
    """
    return ROLE_LABELS.get(str(member.get("role") or ""), "a member").split(" ", 1)[1]


def _role_phrase(member: dict) -> str:
    role = ROLE_LABELS.get(str(member.get("role") or ""), "a member")
    # `membershipStatus` is whether they are still here; `role` is the degree, so
    # someone who has finished is a past *member*, not a past PhD.
    past = str(member.get("membershipStatus") or "active") == "completed"
    return f"{'was' if past else 'is'} {role} in"


def _identity(member: dict) -> str:
    name = str(member.get("name") or "").strip() or "This member"
    return f"{name} {_role_phrase(member)} {GROUP}."


def _venues(publications: list[dict]) -> list[str]:
    counts = Counter(
        venue
        for pub in publications
        if (venue := str(pub.get("venue") or "").strip()) and venue.lower() not in _EMPTY_VENUES
    )
    # Only a venue they returned to says anything; a single appearance is noise.
    return [venue for venue, count in counts.most_common(2) if count > 1]


def _record(publications: list[dict]) -> str:
    years = sorted(pub["year"] for pub in publications if isinstance(pub.get("year"), int))
    count = len(publications)
    noun = "publication" if count == 1 else "publications"
    span = ""
    if years and years[0] != years[-1]:
        span = f", from {years[0]} to {years[-1]}"
    elif years:
        span = f", from {years[0]}"
    return f"The site lists {count} of their {noun}{span}."


def _where(publications: list[dict]) -> str:
    venues = _venues(publications)
    if not venues:
        return ""
    if len(venues) == 1:
        return f"That work appears most often in {venues[0]}."
    return f"That work appears most often in {venues[0]} and {venues[1]}."


def _latest(publications: list[dict]) -> str:
    dated = [pub for pub in publications if isinstance(pub.get("year"), int) and pub.get("title")]
    if not dated:
        return ""
    newest = max(dated, key=lambda pub: pub["year"])
    return f"The most recent is “{str(newest['title']).strip()}” ({newest['year']})."


def _interests(member: dict) -> str:
    raw = member.get("researchInterests")
    items = raw if isinstance(raw, list) else [raw] if raw else []
    listed = [str(item).strip() for item in items if str(item or "").strip()]
    if not listed:
        return ""
    if len(listed) == 1:
        return f"Listed research interests: {listed[0]}."
    return f"Listed research interests: {', '.join(listed[:-1])} and {listed[-1]}."


def extractive_bio(member: dict, publications: list[dict] | None = None) -> str:
    """A short third-person draft from the member's own record. Never invents.

    A person with nothing linked to them still gets a true first sentence, which
    is the point: it beats the placeholder that named no one in particular, and
    it fills in on its own as their publications get linked.
    """
    publications = publications or []
    sentences = [_identity(member)]
    if publications:
        sentences += [_record(publications), _where(publications), _latest(publications)]
    sentences.append(_interests(member))
    return " ".join(part for part in sentences if part)
