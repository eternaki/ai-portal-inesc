"""Deciding the answer's language in code, instead of letting the model guess."""

import pytest

from app.language import detect_language, language_name


@pytest.mark.parametrize(
    "text",
    [
        "Que investigação fazem sobre imagem médica?",
        "Quem trabalha em aprendizagem automática?",
        "Quais sao os topicos de mestrado abertos?",   # no accents at all
        "sobre o que e o grupo",
    ],
)
def test_portuguese_is_recognised(text):
    assert detect_language(text) == "pt"


@pytest.mark.parametrize(
    "text",
    [
        "What research is done on medical imaging?",
        "Who is Arlindo Oliveira?",
        "how do I bake bread",
        "which projects is the group involved in",
    ],
)
def test_english_is_recognised(text):
    assert detect_language(text) == "en"


def test_a_single_accent_settles_an_otherwise_ambiguous_question():
    # Two words, no function words to count — the accent is the whole signal.
    assert detect_language("imagem médica") == "pt"


def test_an_english_technical_phrase_follows_the_locale_being_read():
    # "deep learning" is the term in both languages. Someone reading the site in
    # Portuguese who types it is asking a Portuguese question; on the English site
    # the same words are an English one. Neither is decidable from the text.
    assert detect_language("deep learning", default="pt") == "pt"
    assert detect_language("deep learning", default="en") == "en"


def test_nothing_to_go_on_falls_back_rather_than_guessing():
    for text in ("", "   ", "?!", "12345"):
        assert detect_language(text, default="pt") == "pt"
        assert detect_language(text, default="en") == "en"


def test_a_name_alone_is_not_evidence_of_a_language():
    # Portuguese names are not Portuguese questions; asked on the English site
    # this must stay English.
    assert detect_language("Arlindo Oliveira", default="en") == "en"


def test_the_prompt_gets_a_word_not_a_code():
    assert language_name("pt") == "Portuguese"
    assert language_name("en") == "English"
    assert language_name("zz") == "English"
