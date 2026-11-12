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
_AUTHOR_ID = re.compile(r"(?:openalex\.org/(?:authors/)?)?(a\d+)\s*/?$", re.IGNORECASE)


def normalize_author_id(raw: str | None) -> str | None:
    """'https://openalex.org/A5041559313' -> 'A5041559313'; anything else -> None."""
    match = _AUTHOR_ID.search((raw or "").strip())
    return match.group(1).upper() if match else None


def authors_from_members(members: list[dict[str, Any]]) -> tuple[list[dict], list[str]]:
    """Ingest authors from member documents, plus the names whose id is unusable.

    The second list is reported, not raised: one mistyped id should not stop the
    other members' papers from arriving.
    """
    authors: list[dict] = []
    invalid: list[str] = []
    for member in members:
        if member.get("membershipStatus") != "active":
            continue
        raw = member.get("openalexId")
        if not (raw or "").strip():
            continue
        author_id = normalize_author_id(raw)
        if author_id is None:
            invalid.append(member.get("name") or f"member {member.get('id')}")
            continue
        authors.append(
            {"name": member.get("name"), "openalexId": author_id, "memberId": member["id"]}
        )
    return authors, invalid


def load_member_authors() -> tuple[list[dict], list[str]]:
    """Read the members from Payload and turn them into ingest authors."""
    members = payload_api.find_all(
        "members", {"openalexId": {"exists": True}, "membershipStatus": {"equals": "active"}}
    )
    return authors_from_members(members)
