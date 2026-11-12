"""Unit tests for choosing ingest authors from members (pure, no DB/network)."""

from app.pipelines.ingest_authors import authors_from_members, normalize_author_id


def test_profile_url_and_lower_case_reduce_to_the_id():
    # Editors paste what the browser shows; all of these mean the same author.
    for raw in (
        "A5041559313",
        "a5041559313",
        " https://openalex.org/A5041559313 ",
        "https://openalex.org/authors/a5041559313/",
    ):
        assert normalize_author_id(raw) == "A5041559313"


def test_a_work_id_or_garbage_is_not_an_author():
    # W… is a paper, not a person: following it would fetch nothing, silently.
    for raw in ("W2741809807", "https://openalex.org/W2741809807", "0000-0002-1825-0097", "", None):
        assert normalize_author_id(raw) is None


def test_only_active_members_with_an_id_are_followed():
    members = [
        {"id": 1, "name": "Active", "membershipStatus": "active", "openalexId": "A1"},
        {"id": 2, "name": "Left", "membershipStatus": "completed", "openalexId": "A2"},
        {"id": 3, "name": "No id", "membershipStatus": "active", "openalexId": None},
        {"id": 4, "name": "Blank", "membershipStatus": "active", "openalexId": "  "},
    ]
    authors, invalid = authors_from_members(members)
    assert authors == [{"name": "Active", "openalexId": "A1", "memberId": 1}]
    assert invalid == []


def test_a_bad_id_is_reported_without_dropping_the_others():
    members = [
        {"id": 1, "name": "Typo", "membershipStatus": "active", "openalexId": "W123"},
        {"id": 2, "name": "Fine", "membershipStatus": "active", "openalexId": "A2"},
    ]
    authors, invalid = authors_from_members(members)
    assert [a["memberId"] for a in authors] == [2]
    assert invalid == ["Typo"]
