"""Recognising a question that asks for a section rather than about a subject.

"What projects is the group involved in?" scored 0.39 against a 0.40 floor and was
refused with nine projects in the database. Not because the retrieval is broken —
because the question has no subject to rank by. It names a *section* of the site
and asks to see it, which similarity cannot express: there is no vector for "all
of them".

It is the same shape as "what did the group publish in 2024?", where the period
was the whole query and the answer had to come from a date filter. Here the
collection is the whole query and the answer has to come from the collection.

Lowering the floor would not fix it and would break something else: "tell me about
blockchain" scores 0.37, so 0.39 is genuinely close to the noise. The fix is to
answer a different kind of question differently, not to loosen the gate.
"""

from __future__ import annotations

import re

# The words a visitor uses for each section, in both site languages. Function-word
# plurals and singulars both, because "what project are you working on" is as
# likely as "what projects".
_COLLECTION_WORDS = {
    "projects": ("project", "projects", "projeto", "projetos", "projectos", "projecto"),
    "publications": (
        "publication", "publications", "paper", "papers", "article", "articles",
        "publicação", "publicações", "publicacao", "publicacoes", "artigo", "artigos",
    ),
    "members": (
        "member", "members", "people", "team", "staff", "researchers", "group members",
        "membro", "membros", "pessoas", "equipa", "equipe", "investigadores",
    ),
    "dissertations": (
        "dissertation", "dissertations", "thesis", "theses", "topic", "topics",
        "dissertação", "dissertações", "dissertacao", "tese", "teses", "tema", "temas",
    ),
    "events": (
        "event", "events", "seminar", "seminars", "reading group", "talk", "talks",
        "evento", "eventos", "seminário", "seminarios", "palestra",
    ),
    "software": (
        "software", "tool", "tools", "dataset", "datasets", "code", "library",
        "ferramenta", "ferramentas", "conjunto de dados",
    ),
    "news": ("news", "announcement", "announcements", "notícia", "noticias", "notícias"),
}

# How each section is worth listing when nobody asked for an order. Newest first
# where there is a date; by name where there is not, since alphabetical is the only
# order a roster has that is not arbitrary.
LIST_SORT = {
    "projects": "-yearStart",
    "publications": "-year",
    "members": "name",
    "dissertations": "status",
    "events": "-date",
    "software": "-createdAt",
    "news": "-date",
}


def named_collection(text: str) -> str | None:
    """Which section this question names, if it names exactly one.

    Returns None when the question names none — nothing to list — or more than
    one, where guessing which the visitor meant would be worse than the ordinary
    semantic answer.
    """
    lowered = f" {(text or '').lower()} "
    found = {
        collection
        for collection, words in _COLLECTION_WORDS.items()
        if any(re.search(rf"\b{re.escape(word)}\b", lowered) for word in words)
    }
    return found.pop() if len(found) == 1 else None
