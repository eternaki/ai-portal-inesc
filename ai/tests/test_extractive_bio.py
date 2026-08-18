"""The LLM-free bio draft: what it says, and what it must never say."""

import pytest

from app.pipelines.extractive_bio import extractive_bio

FACULTY = {"name": "Ana Silva", "role": "faculty", "membershipStatus": "active"}
PUBS = [
    {"title": "Learning from graphs", "year": 2019, "venue": "ECML"},
    {"title": "Graphs again", "year": 2021, "venue": "ECML"},
    {"title": "A newer paper", "year": 2024, "venue": "NeurIPS"},
]


def test_it_opens_with_who_the_person_is():
    assert extractive_bio(FACULTY).startswith(
        "Ana Silva is a faculty member in the Machine Learning and Knowledge Discovery group"
    )


def test_a_member_with_nothing_linked_still_gets_a_true_sentence():
    # The placeholder this replaces named nobody in particular. One accurate
    # sentence beats that, and grows on its own as publications get linked.
    bio = extractive_bio({"name": "Rui Costa", "role": "msc"})
    assert bio == (
        "Rui Costa is an MSc student in the Machine Learning and Knowledge Discovery "
        "group at INESC-ID."
    )


def test_publication_counts_are_attributed_to_the_site_not_the_person():
    # Our corpus is partial by construction — the coverage report exists to
    # measure exactly that gap. Claiming the count as the person's whole output
    # would be both unsupportable and unflattering.
    bio = extractive_bio(FACULTY, PUBS)
    assert "The site lists 3 of their publications" in bio
    assert "has published" not in bio
    assert "author of 3" not in bio


def test_it_reports_the_span_and_the_newest_work():
    bio = extractive_bio(FACULTY, PUBS)
    assert "from 2019 to 2024" in bio
    assert "The most recent is “A newer paper” (2024)." in bio


def test_a_single_publication_reads_as_one():
    bio = extractive_bio(FACULTY, [PUBS[0]])
    assert "1 of their publication," in bio
    assert "from 2019." in bio


def test_only_a_venue_they_returned_to_is_named():
    # One appearance at a venue says nothing about where someone publishes, and
    # naming it would read as a claim about their career that we cannot support.
    bio = extractive_bio(FACULTY, PUBS)
    assert "ECML" in bio          # twice
    assert "NeurIPS" not in bio   # once


def test_placeholder_venues_from_openalex_are_never_named():
    pubs = [
        {"title": "A", "year": 2020, "venue": "unknown venue"},
        {"title": "B", "year": 2021, "venue": "unknown venue"},
    ]
    bio = extractive_bio(FACULTY, pubs)
    assert "unknown venue" not in bio
    assert "appears most often" not in bio


def test_someone_who_has_left_is_described_in_the_past():
    # membershipStatus is whether they are still here; role stays the degree.
    bio = extractive_bio({"name": "Rui Costa", "role": "phd", "membershipStatus": "completed"})
    assert "was a PhD student" in bio
    assert " is a " not in bio


@pytest.mark.parametrize(
    "role,expected",
    [("faculty", "is a faculty member"), ("msc", "is an MSc student"), ("alumni", "is a former member")],
)
def test_the_article_agrees_with_the_role(role, expected):
    assert expected in extractive_bio({"name": "X Y", "role": role})


def test_interests_are_listed_when_present():
    member = {**FACULTY, "researchInterests": ["graph learning", "privacy"]}
    assert "Listed research interests: graph learning and privacy." in extractive_bio(member)


def test_it_never_invents_a_pronoun_or_a_degree():
    # Nothing in the record says anyone's gender, and nothing says where they
    # studied. A draft that guesses either is worse than the placeholder.
    bio = extractive_bio(FACULTY, PUBS).lower()
    for invented in (" he ", " she ", " his ", " her ", "phd from", "graduated", "university of"):
        assert invented not in bio


def test_missing_and_malformed_records_do_not_crash():
    for member in ({}, {"name": ""}, {"name": "X", "role": "nonsense"}, {"name": "X", "researchInterests": ""}):
        assert isinstance(extractive_bio(member), str)
    # A publication with no year or venue must not break the sentences it feeds.
    assert isinstance(extractive_bio(FACULTY, [{"title": "T"}]), str)
