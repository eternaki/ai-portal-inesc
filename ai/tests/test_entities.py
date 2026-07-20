"""Unit tests for the entity → embedding-text adapters (pure, no DB/LLM)."""

from app.entities import ENTITY_ADAPTERS, lexical_to_text


def test_lexical_to_text_flattens_richtext():
    doc = {
        "root": {
            "children": [
                {"children": [{"text": "Hello"}, {"text": "world"}]},
                {"children": [{"text": "second para"}]},
            ]
        }
    }
    out = lexical_to_text(doc)
    assert "Hello" in out and "world" in out and "second para" in out


def test_lexical_to_text_handles_empty():
    assert lexical_to_text(None) == ""
    assert lexical_to_text({}) == ""
    assert lexical_to_text("plain") == "plain"


def test_member_adapter_enriches_short_text():
    # A name alone embeds poorly; the adapter must pull in bio + interests.
    member = {
        "name": "Ada Lovelace",
        "role": "Researcher",
        "bio": {"root": {"children": [{"children": [{"text": "Works on analytical engines."}]}]}},
        "researchInterests": ["computing", "mathematics"],
        "careerTrajectory": "Pioneer of programming.",
    }
    text = ENTITY_ADAPTERS["members"](member)
    assert "Ada Lovelace" in text
    assert "analytical engines" in text
    assert "computing" in text and "mathematics" in text
    assert "Pioneer" in text


def test_publication_adapter():
    pub = {"title": "Deep Nets", "abstract": "We train deep networks."}
    text = ENTITY_ADAPTERS["publications"](pub)
    assert text == "Deep Nets\nWe train deep networks."


def test_all_adapters_return_string_for_empty_doc():
    for adapter in ENTITY_ADAPTERS.values():
        assert isinstance(adapter({}), str)
