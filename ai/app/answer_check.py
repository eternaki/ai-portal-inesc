"""Checking the answer against what the prompt required.

Two rules kept being written into prompts and kept being broken, both by the same
mechanism: a rule is a request, and a small model honours a request some of the
time. Measured on this project — a Portuguese question answered in English on
three of six runs, and "the site lists 226 of their publications" rewritten as
"They have published 226 papers" on a run where the prompt forbade exactly that.

Neither is a hard rule until something checks it, which is the pattern the rest of
this service already follows: the chat refuses off-topic questions in code rather
than asking the model to; injection is screened in code rather than promised
against. This is that same move for the answer itself.

Deliberately narrow. It looks for three specific, checkable defects and says nothing
about whether an answer is *good* — that is not decidable here, and a filter that
tried would reject correct answers for style.
"""

from __future__ import annotations

import re

from app.language import detect_language

# Attributing a count to a person or the group. Our corpus is partial by
# construction — that is what the coverage report measures — so "they published
# 226 papers" is a claim about a career we cannot support, where "the site lists
# 226 of their publications" is a fact about our database.
#
# Only counts. "They have published extensively" says nothing we can contradict.
_UNSUPPORTED_COUNT = re.compile(
    r"""(
        \b(?:has|have|had)\s+(?:\w+\s+){0,2}?(?:published|authored|written|produced)\s+(?:\w+\s+){0,2}?\d+
      | \b(?:published|authored|wrote)\s+\d+\s+(?:papers?|publications?|articles?|works?)
      | \bauthor(?:ed)?\s+of\s+\d+
      | \b(?:research|work)\s+has\s+(?:resulted\s+in|produced)\s+\d+
      | \b\d+\s+(?:papers?|publications?)\s+to\s+(?:their|his|her)\s+name
      | \bpublic(?:ou|aram)\s+\d+
      | \b(?:tem|têm|possui)\s+\d+\s+(?:publicaç|artigos)
      | \bé\s+autor(?:a)?\s+de\s+\d+
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# The supported phrasing, which must never be flagged. Checked first because
# "the site lists 226 publications" contains a count next to a publication word.
_ATTRIBUTED_TO_SITE = re.compile(
    r"\b(?:site|website|page|database|portal)\s+(?:lists?|holds?|has|shows?|records?)\b"
    r"|\blisted\s+(?:here|on\s+(?:the\s+)?(?:site|website|page))\b"
    r"|\b(?:o\s+)?site\s+lista\b",
    re.IGNORECASE,
)


def unsupported_counts(answer: str) -> list[str]:
    """Phrases that turn "the site lists N" into a claim about someone's output."""
    return [m.group(0).strip() for m in _UNSUPPORTED_COUNT.finditer(answer or "")]


# Our own prompt showing through the answer. A small model given a long prompt
# narrates the document instead of replying to it, and the visitor is told about
# their own question before being told anything else.
#
# Two shapes, because catching only the first missed the real ones. The literal
# label — "Visitor's question:" — and the model *describing* the framing in prose:
# "A visitor has asked about...", "A questão do visitante é...". The paraphrase is
# what actually reached a tester, and it slipped through in English entirely; the
# Portuguese one was caught only because it also happened to be the wrong
# language, which is luck, not a check.
_ECHOED_PROMPT = re.compile(
    r"^\s*(?:visitor'?s question|relevant entries|conversation so far|answer)\s*:"
    # Opening by talking about the visitor at all, whatever the verb: enumerating
    # verbs was losing to "a visitor inquiring about...". An answer that starts by
    # describing who is asking has not started answering.
    r"|^\s*(?:the|a|o|os|as)\s+(?:visitor|user|visitante|utilizador|usuário)\b"
    r"|\b(?:the|a)\s+(?:visitor|user)\s+(?:has\s+)?(?:asked|asks|wants to know|is asking)\b"
    r"|\b(?:the|a)\s+(?:visitor|user)'?s?\s+question\b"
    r"|\ba\s+(?:questão|pergunta)\s+do\s+(?:visitante|utilizador|usuário)\b"
    r"|\bo\s+(?:visitante|utilizador)\s+(?:perguntou|pergunta|quer saber)\b",
    re.IGNORECASE | re.MULTILINE,
)


# A listed entry: our own context format, which the model often copies verbatim.
# Its titles are bibliographic and almost always English, whatever language the
# answer is written in.
_ENTRY_LINE = re.compile(r"^\s*\[\d+\][^\n]*$", re.MULTILINE)


def prose_only(answer: str) -> str:
    """The answer's own words, with listed entries removed.

    Language has to be judged on what the model wrote, not on what it quoted. A
    Portuguese answer that lists six English paper titles reads as English by word
    count — measured: the whole text detected "en" while its own two sentences
    detected "pt" — so the wrong-language check passed something a Portuguese
    reader would still find written in the wrong language.
    """
    return _ENTRY_LINE.sub("", answer or "").strip()


def problems(answer: str, *, language: str) -> list[str]:
    """What is wrong with this answer. Empty list means nothing checkable is.

    `language` is the code ("en"/"pt") the answer was required to be in.
    """
    found: list[str] = []
    text = (answer or "").strip()
    if not text:
        return ["the answer is empty"]

    # Long enough to judge: a two-word answer has no reliable language, and
    # flagging it would degrade a perfectly good short reply.
    prose = prose_only(text)
    if len(prose.split()) >= 12 and detect_language(prose, default=language) != language:
        found.append(f"answered in the wrong language (expected {language})")

    if _ECHOED_PROMPT.search(text):
        found.append("echoed the prompt's own labels back into the answer")

    for phrase in unsupported_counts(text):
        if not _ATTRIBUTED_TO_SITE.search(text):
            found.append(f"unsupported claim about output: {phrase!r}")
            break

    return found


def correction(found: list[str]) -> str:
    """A retry instruction naming what was wrong, appended to the same prompt.

    Naming the specific defect rather than repeating the rule: the rule was
    already in the prompt and did not take.
    """
    return (
        "\n\nYour previous answer was rejected for: "
        + "; ".join(found)
        + ". Write it again, fixing exactly that and changing nothing else. "
        "Counts belong to the site's records, never to a person's career: write "
        '"the site lists N of their publications", not "they published N papers".'
    )
