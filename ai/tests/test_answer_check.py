"""Two prompt rules a small model kept breaking, now checked instead of requested."""

import pytest

from app.answer_check import correction, problems, unsupported_counts

SITE = "Arlindo L. Oliveira is a faculty member. The site lists 226 of their publications."


# --- attributing our partial record to someone's career ---------------------


@pytest.mark.parametrize(
    "answer",
    [
        "They have published 226 papers, from 1991 to 2026.",
        "He has published 226 papers.",
        "Their research has resulted in 226 publications.",
        "Ana authored 12 papers on graphs.",
        "She is the author of 40 publications.",
        "They have 226 papers to their name.",
        "Publicou 226 artigos entre 1991 e 2026.",
        "É autor de 226 publicações.",
    ],
)
def test_a_count_claimed_as_someone_s_output_is_caught(answer):
    assert unsupported_counts(answer), answer
    assert problems(answer, language="en") or problems(answer, language="pt")


@pytest.mark.parametrize(
    "answer",
    [
        SITE,
        "The site lists 226 of their publications, from 1991 to 2026.",
        "226 publications are listed on the site.",
        "O site lista 226 das suas publicações.",
        "The site holds 12 papers on graph algorithms.",
    ],
)
def test_the_supported_phrasing_is_never_flagged(answer):
    assert problems(answer, language="en") == [] or "language" in " ".join(
        problems(answer, language="en")
    ), answer


def test_a_claim_without_a_number_is_not_our_business():
    # "published extensively" says nothing we can contradict; only counts do.
    for answer in (
        "They have published extensively on graph algorithms.",
        "Their research has produced influential work in medical imaging.",
    ):
        assert unsupported_counts(answer) == [], answer


# --- answering in the wrong language ----------------------------------------


def test_an_answer_in_the_wrong_language_is_caught():
    english = (
        "The MLKD group conducts research in medical imaging, with a focus on "
        "segmentation and the analysis of clinical images across several projects."
    )
    assert any("wrong language" in p for p in problems(english, language="pt"))
    assert problems(english, language="en") == []


def test_a_short_answer_is_not_judged_for_language():
    # Too little text to tell, and rejecting it would throw away a good reply.
    assert problems("Sim.", language="en") == []
    assert problems("No results found.", language="pt") == []


def test_an_empty_answer_is_a_problem_in_itself():
    assert problems("", language="en") == ["the answer is empty"]
    assert problems("   ", language="en") == ["the answer is empty"]


# --- the retry instruction ---------------------------------------------------


def test_the_correction_names_what_was_wrong():
    found = problems("They have published 226 papers.", language="en")
    text = correction(found)
    assert "226" in text or "published" in text
    assert "the site lists" in text.lower()


def test_a_clean_answer_has_nothing_to_correct():
    assert problems(SITE, language="en") == []


# --- the model continuing the prompt instead of answering it ----------------


@pytest.mark.parametrize(
    "answer",
    [
        "Visitor's question: Who is Arlindo Oliveira?\n\nArlindo is a faculty member.",
        "Answer: Arlindo is a faculty member of the group at INESC-ID in Lisbon.",
        "Relevant entries:\n[1] member: Arlindo\n\nArlindo is a faculty member.",
    ],
)
def test_prompt_scaffolding_echoed_into_the_answer_is_caught(answer):
    # A small model given a long prompt continues the document rather than
    # replying to it, and the visitor sees our own labels above the text.
    assert any("echoed" in p for p in problems(answer, language="en")), answer


def test_the_same_words_inside_a_sentence_are_fine():
    # Only a label at the start of a line is scaffolding; the words themselves
    # are ordinary English a real answer may well use.
    answer = "The answer to your question about the reading group is in entry [1] below."
    assert not any("echoed" in p for p in problems(answer, language="en"))
