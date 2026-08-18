"""Pulling a period out of a question, so dates stop being matched by meaning.

"What was discussed at the reading group in March 2024" scored 0.37 against a
0.40 floor and was refused, with eighty-three dated events sitting in the
database. Two separate failures, and both need this:

  * A vector cannot represent "March 2024" as a range. "2019" and "2024" are
    similar strings about similar things, so similarity ranks a 2019 paper as a
    fine answer to a question about 2024. Dates are a filter, not a neighbourhood.
  * The date words drag the vector away from what the question is *about*.
    "reading group in March 2024" embeds as neither a reading group nor a date.
    Removing the period first is what lets "reading group" match reading groups.

So this returns both halves: the question with the period cut out, to embed, and
the period itself, to filter with. English and Portuguese, because the site is
both.

Deliberately not a general date parser. It covers the shapes a visitor actually
types about a research group's archive — a year, a range, a month, "last year",
"recent" — and returns None for everything else, which leaves the question
behaving exactly as it does today.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

# How many years back "recent" reaches. Short enough to mean something on a
# corpus spanning 1991-2026, long enough that a quiet year is not an empty answer.
RECENT_YEARS = 2

_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}

# 1980 rather than any four digits: "384 dimensions" and "10.1145" are not years,
# and a research group's archive does not need the 1800s.
_YEAR = r"(19[89]\d|20[0-4]\d)"


@dataclass(frozen=True)
class Timeframe:
    """An inclusive year range. Days are not kept — publications carry only a year."""

    start: int
    end: int

    def contains_year(self, year: int | None) -> bool:
        return year is not None and self.start <= year <= self.end

    def contains_date(self, value: str | None) -> bool:
        """`value` is an ISO date or datetime from the CMS; year is all we compare."""
        if not value or len(str(value)) < 4:
            return False
        try:
            return self.contains_year(int(str(value)[:4]))
        except ValueError:
            return False


def _strip(text: str, *spans: tuple[int, int]) -> str:
    """Remove matched spans and tidy the connectives they leave behind."""
    out = text
    for start, end in sorted(spans, reverse=True):
        out = out[:start] + " " + out[end:]
    # "papers  in  ?" -> "papers?" — a dangling preposition is noise in the vector.
    out = re.sub(r"\b(in|from|during|em|de|do|da|entre)\s*(?=[?.!]|$)", " ", out, flags=re.I)
    return re.sub(r"\s+", " ", out).strip(" ,")


def extract_timeframe(text: str, today: date | None = None) -> tuple[str, Timeframe | None]:
    """Return (question without the period, the period) — or (question, None).

    `today` is injectable so tests do not drift into failure as the year turns.
    """
    today = today or date.today()
    raw = text or ""
    lowered = raw.lower()

    # Ranges first: "between 2020 and 2023", "2020-2023", "de 2020 a 2023".
    span = re.search(rf"(?:between\s+|entre\s+|from\s+|de\s+)?{_YEAR}\s*(?:-|–|to|and|a|até|e)\s*{_YEAR}", lowered)
    if span:
        first, second = int(span.group(1)), int(span.group(2))
        return _strip(raw, span.span()), Timeframe(min(first, second), max(first, second))

    # "since 2020" / "desde 2020" / "after 2019" — open-ended up to now.
    since = re.search(rf"\b(?:since|after|desde|depois de|a partir de)\s+{_YEAR}", lowered)
    if since:
        return _strip(raw, since.span()), Timeframe(int(since.group(1)), today.year)

    before = re.search(rf"\b(?:before|until|antes de|até)\s+{_YEAR}", lowered)
    if before:
        return _strip(raw, before.span()), Timeframe(1980, int(before.group(1)))

    # A month narrows nothing we can use — publications carry only a year — but it
    # still has to come out of the text, or it drags the vector.
    month = re.search(rf"\b({'|'.join(_MONTHS)})\b(?:\s+(?:de\s+)?{_YEAR})?", lowered)
    if month and month.group(2):
        year = int(month.group(2))
        return _strip(raw, month.span()), Timeframe(year, year)

    year_only = re.search(rf"\b(?:in|em|de|of|during)?\s*{_YEAR}\b", lowered)
    if year_only:
        year = int(year_only.group(1))
        return _strip(raw, year_only.span()), Timeframe(year, year)

    relative = [
        (r"\b(this year|este ano|neste ano)\b", (today.year, today.year)),
        (r"\b(last year|ano passado|no ano passado)\b", (today.year - 1, today.year - 1)),
        (r"\b(recent(ly)?|latest|newest|recente(s)?|últimos anos|ultimos anos|mais recentes)\b",
         (today.year - RECENT_YEARS, today.year)),
    ]
    for pattern, (start, end) in relative:
        found = re.search(pattern, lowered)
        if found:
            return _strip(raw, found.span()), Timeframe(start, end)

    return raw, None
