"""Dates come out of the question and become a filter, not a similarity score."""

from datetime import date

import pytest

from app.timeframe import Timeframe, extract_timeframe

TODAY = date(2026, 8, 18)


def frame(text):
    return extract_timeframe(text, today=TODAY)


@pytest.mark.parametrize(
    "text,expected",
    [
        ("papers in 2024", (2024, 2024)),
        ("what happened in 2019", (2019, 2019)),
        ("artigos de 2021", (2021, 2021)),
        ("reading group in March 2024", (2024, 2024)),
        ("o que houve em março de 2023", (2023, 2023)),
        ("papers between 2020 and 2023", (2020, 2023)),
        ("publications 2018-2021", (2018, 2021)),
        ("work since 2020", (2020, 2026)),
        ("papers before 2010", (1980, 2010)),
        ("what did they publish last year", (2025, 2025)),
        ("papers this year", (2026, 2026)),
        ("recent work on graphs", (2024, 2026)),
        ("trabalhos mais recentes", (2024, 2026)),
    ],
)
def test_the_period_is_recognised(text, expected):
    _, tf = frame(text)
    assert tf == Timeframe(*expected), text


@pytest.mark.parametrize(
    "text",
    [
        "What research is done on medical imaging?",
        "Who is Arlindo Oliveira?",
        "Que investigação fazem sobre imagem médica?",
    ],
)
def test_a_question_without_a_period_is_left_exactly_as_it_was(text):
    cleaned, tf = frame(text)
    assert tf is None
    assert cleaned == text


def test_the_period_is_cut_out_of_the_text_that_gets_embedded():
    # The whole reason this exists: "reading group in March 2024" embeds as
    # neither a reading group nor a date, and scored 0.37 against a 0.40 floor.
    cleaned, tf = frame("reading group in March 2024")
    assert cleaned == "reading group"
    assert tf == Timeframe(2024, 2024)


def test_no_dangling_preposition_is_left_behind():
    # "papers in ?" would still be in the vector, and reads as noise.
    for text in ("papers in 2024", "publicações em 2021", "work during 2019"):
        cleaned, _ = frame(text)
        assert not cleaned.rstrip("?").rstrip().endswith((" in", " em", " during", " de"))
        assert "  " not in cleaned


def test_numbers_that_are_not_years_are_left_alone():
    # A vector is 384 numbers and a DOI is full of digits; neither is a date.
    for text in ("what is a 384 dimensional vector", "doi 10.1145 paper", "top 10 papers"):
        cleaned, tf = frame(text)
        assert tf is None, text
        assert cleaned == text


def test_a_bare_month_without_a_year_is_not_a_period():
    # "May" is also an English verb, and a month alone gives no range to filter by.
    _, tf = frame("may we cite this paper")
    assert tf is None


def test_the_range_is_ordered_however_it_was_typed():
    assert frame("papers 2023-2020")[1] == Timeframe(2020, 2023)


def test_matching_records_by_year_and_by_date_string():
    tf = Timeframe(2020, 2022)
    assert tf.contains_year(2021) and not tf.contains_year(2019)
    assert tf.contains_date("2021-03-04") and tf.contains_date("2022-12-31T10:00:00Z")
    assert not tf.contains_date("2019-01-01")
    # Missing or malformed dates must not slip through a filter as if they matched.
    for bad in (None, "", "n/a", "20"):
        assert not tf.contains_date(bad)
    assert not tf.contains_year(None)


def test_relative_periods_move_with_the_calendar():
    _, tf = extract_timeframe("papers last year", today=date(2030, 1, 1))
    assert tf == Timeframe(2029, 2029)
