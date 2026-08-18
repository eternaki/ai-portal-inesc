"""Which of the site's two languages a visitor is writing in.

The chat prompt used to say "answer in the language of the question" and leave the
model to work it out. It does, until the conversation has a few English turns
behind it: asked a Portuguese question after three English ones, a small model
answers in English about half the time, because the history in front of it is
louder than the instruction. Measured, not assumed — six runs of the same
question with the same history split three and three.

So the language stops being something the model infers. It is decided here and
stated as a fact in the prompt, which is not a judgement a language model needs
to make on our behalf.

The site is English and Portuguese only, so this is a two-way choice and can stay
a word list. Anything more (a detection library, a model call) would be a
dependency and a round trip for a question with two possible answers.
"""

from __future__ import annotations

import re

# Portuguese words that are rare-to-absent in English, weighted by how much they
# settle the question. Function words rather than topic words: a visitor asking
# about "machine learning" uses the English term in both languages.
_PT_WORDS = {
    "que", "quem", "qual", "quais", "como", "onde", "quando", "porque", "porquê",
    "fazem", "faz", "são", "é", "está", "estão", "tem", "têm", "há",
    "sobre", "para", "com", "dos", "das", "do", "da", "no", "na", "nos", "nas",
    "uma", "um", "os", "as", "não", "sim", "mais", "muito", "também",
    "investigação", "pesquisa", "grupo", "trabalho", "artigos", "publicações",
    "pessoas", "quantos", "quantas", "vocês", "seu", "sua",
}

_EN_WORDS = {
    "what", "who", "which", "how", "where", "when", "why", "whose",
    "the", "is", "are", "was", "were", "do", "does", "did", "has", "have",
    "about", "on", "in", "of", "for", "with", "and", "or", "not",
    "research", "group", "work", "papers", "publications", "people",
    "any", "some", "many", "your", "their", "there",
}

# Characters that only Portuguese uses of the two. A single one is strong evidence;
# their absence proves nothing, since Portuguese can be written without accents.
_PT_CHARS = re.compile(r"[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]")

_WORD = re.compile(r"[a-zà-üA-ZÀ-Ü]+")


def detect_language(text: str, default: str = "en") -> str:
    """"pt" or "en" for a visitor's message.

    `default` decides the genuinely ambiguous cases — an empty message, a bare
    name, a query that is only an English technical term. Pass the locale the
    visitor is reading the site in: someone browsing in Portuguese who types
    "deep learning" is asking a Portuguese question about an English phrase.
    """
    words = [w.lower() for w in _WORD.findall(text or "")]
    if not words:
        return default

    pt = sum(1 for w in words if w in _PT_WORDS)
    en = sum(1 for w in words if w in _EN_WORDS)
    # An accent settles it: no English question carries one, while a Portuguese
    # one written without accents still has to be caught by the word lists.
    if _PT_CHARS.search(text or ""):
        pt += 2

    if pt == en:
        return default
    return "pt" if pt > en else "en"


LANGUAGE_NAMES = {"pt": "Portuguese", "en": "English"}


def language_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code, LANGUAGE_NAMES["en"])
