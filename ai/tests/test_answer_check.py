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


@pytest.mark.parametrize(
    "answer",
    [
        "A visitor has asked about the publications of the group in 2024.",
        "The visitor asks which projects the group runs.",
        "The user wants to know about medical imaging research here.",
        "A questão do visitante é sobre publicações do grupo em 2024.",
        "O visitante perguntou sobre imagem médica no grupo.",
        "The visitor's question concerns the reading group archive.",
    ],
)
def test_the_model_narrating_our_prompt_is_caught_too(answer):
    # Catching only the literal "Visitor's question:" label missed the shape that
    # actually reached a tester — the model describing the framing in prose. In
    # English it slipped through entirely; the Portuguese one was caught only
    # because it was also the wrong language, which is luck rather than a check.
    assert any("echoed" in p for p in problems(answer, language="en")), answer
    assert any("echoed" in p for p in problems(answer, language="pt")), answer


def test_an_answer_that_merely_mentions_visitors_is_fine():
    # The group studies people; "visitors" and "users" are ordinary research words
    # and must not be mistaken for the model narrating its instructions.
    for answer in (
        "The system was evaluated with hospital users over six months of clinical use.",
        "Site visitors to the portal can browse every publication by year.",
    ):
        assert not any("echoed" in p for p in problems(answer, language="en")), answer


@pytest.mark.parametrize(
    "answer",
    [
        "A visitor inquiring about our group's publications in 2024. We published five papers.",
        "The visitor curious about medical imaging will find several dissertations here.",
        "O visitante interessado em imagem médica encontra várias dissertações.",
    ],
)
def test_opening_by_describing_who_is_asking_is_narration_whatever_the_verb(answer):
    # Enumerating verbs lost to "a visitor inquiring about...". The rule is the
    # position: an answer that opens by describing the asker has not begun to
    # answer, no matter which verb follows.
    assert any("echoed" in p for p in problems(answer, language="en")), answer
