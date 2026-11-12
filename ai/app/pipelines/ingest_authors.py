"""Which OpenAlex authors the publication ingest follows.

The list is the People collection itself: every *active* member with an OpenAlex
ID filled in. An editor adds an author by pasting the ID into the member's
profile in the admin; nobody edits a file or opens a PR, and the list cannot drift
from the People page.

Active only, because OpenAlex follows a person, not their affiliation: a former
member's papers from after they left would otherwise keep arriving as drafts for
an editor to reject, every run.
"""

import re
from typing import Any

from app import payload_api

# OpenAlex author ids are "A" + digits. Editors paste whatever the browser shows,
# so the profile URL and lower-case forms are accepted and reduced to the id.
# Matched against the whole value: an unanchored search would read an id out of
# any string that happens to end in "a" + digits.
_AUTHOR_ID = re.compile(
    r"(?:https?://)?(?:www\.)?(?:api\.)?(?:openalex\.org/(?:authors/)?)?(a\d+)/?", re.IGNORECASE
)


def normalize_author_id(raw: str | None) -> str | None:
    """'https://openalex.org/A5041559313' -> 'A5041559313'; anything else -> None."""
    match = _AUTHOR_ID.fullmatch((raw or "").strip())
    return match.group(1).upper() if match else None


def authors_from_members(members: list[dict[str, Any]]) -> tuple[list[dict], list[str]]:
    """Ingest authors from member documents, plus the names whose id is unusable.

    The second list is reported, not raised: one mistyped id should not stop the
    other members' papers from arriving. The same id on two members (Payload's
    `unique` compares the raw text, so "A1" and "a1" both pass) is reported for
    both rather than silently linking the papers to whichever came last.
    """
    authors: list[dict] = []
    invalid: list[str] = []
    claimed: dict[str, list[str]] = {}
    for member in members:
        if member.get("membershipStatus") != "active":
            continue
        raw = member.get("openalexId")
        if not (raw or "").strip():
            continue
        author_id = normalize_author_id(raw)
        name = member.get("name") or f"member {member.get('id')}"
        if author_id is None:
            invalid.append(name)
            continue
        claimed.setdefault(author_id, []).append(name)
        authors.append({"name": name, "openalexId": author_id, "memberId": member["id"]})

    shared = {aid for aid, names in claimed.items() if len(names) > 1}
    invalid.extend(n for aid in sorted(shared) for n in claimed[aid])
    return [a for a in authors if a["openalexId"] not in shared], invalid


def load_member_authors() -> tuple[list[dict], list[str]]:
    """Read the members from Payload and turn them into ingest authors."""
    members = payload_api.find_all(
        "members", {"openalexId": {"exists": True}, "membershipStatus": {"equals": "active"}}
    )
    return authors_from_members(members)
