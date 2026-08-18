"""Questions that ask to see a section, rather than about a subject."""

import pytest

from app.collection_intent import LIST_SORT, named_collection


@pytest.mark.parametrize(
    "question,expected",
    [
        ("What projects is the group involved in?", "projects"),
        ("Que projetos tem o grupo?", "projects"),
        ("Who are the members of the group?", "members"),
        ("Quem faz parte da equipa?", "members"),
        ("What software does the group release?", "software"),
        ("Show me the dissertations", "dissertations"),
        ("Que teses supervisionam?", "dissertations"),
        ("What events are coming up?", "events"),
        ("Any news from the group?", "news"),
        ("What papers have you written?", "publications"),
    ],
)
def test_the_named_section_is_recognised(question, expected):
    assert named_collection(question) == expected


@pytest.mark.parametrize(
    "question",
    [
        "What research is done on medical imaging?",
        "Who is Arlindo Oliveira?",
        "what is the capital of France",
        "tell me about blockchain",
    ],
)
def test_a_question_naming_no_section_asks_for_nothing_to_list(question):
    assert named_collection(question) is None


def test_a_question_naming_two_sections_is_left_to_similarity():
    # "papers and projects" could mean either; guessing which the visitor meant
    # would be worse than the ordinary semantic answer, which can span both.
    assert named_collection("what papers and projects came out of this?") is None


def test_a_word_inside_another_word_is_not_a_section():
    # "topics" is a dissertations word; "topical" and "software-defined" are not
    # the visitor asking for a list.
    assert named_collection("is this a topical area for you") is None


def test_every_section_has_an_order_to_list_it_in():
    # An unsorted list is whatever the database returns, which changes between
    # runs and reads as arbitrary to a visitor.
    for collection in ("projects", "publications", "members", "dissertations", "events", "software", "news"):
        assert LIST_SORT.get(collection), collection
