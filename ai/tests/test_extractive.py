"""Unit tests for the deterministic extractive summarizer (pure, no DB/LLM)."""

from app.pipelines.extractive import (
    EXTRACTIVE_MODEL,
    SUMMARY_KEYS,
    _NOT_SPECIFIED,
    extractive_summary,
)

_ABSTRACT = (
    "Detecting pulmonary embolism from imaging is slow and requires experts. "
    "However, access to specialists is limited in many hospitals. "
    "We propose a deep learning model that classifies electrocardiograms directly. "
    "Our results show the model outperforms prior baselines, achieving 92% accuracy. "
    "A limitation is that the dataset comes from a single hospital."
)


def test_always_returns_all_eleven_keys_as_strings():
    out = extractive_summary({"title": "X", "abstract": _ABSTRACT})
    assert set(out.keys()) == set(SUMMARY_KEYS)
    assert all(isinstance(v, str) and v for v in out.values())


def test_routes_sentences_to_the_right_sections():
    out = extractive_summary({"title": "ECG classifier", "abstract": _ABSTRACT})
    assert "pulmonary embolism" in out["tldr"].lower()
    assert "however" in out["problem"].lower() or "limited" in out["problem"].lower()
    assert "propose" in out["method"].lower()
    assert "accuracy" in out["results"].lower() or "outperforms" in out["results"].lower()
    assert "limitation" in out["limitations"].lower()


def test_never_invents_when_abstract_is_missing():
    out = extractive_summary({"title": "A Study of Graph Neural Networks", "venue": "ICML", "year": 2025})
    # No abstract → tldr falls back to title/venue, the rest stays unspecified.
    assert "graph neural networks" in out["tldr"].lower()
    assert out["problem"] == _NOT_SPECIFIED
    assert out["results"] == _NOT_SPECIFIED


def test_topics_uses_venue_and_title_phrases():
    out = extractive_summary(
        {"title": "Federated Learning for Medical Records", "venue": "NeurIPS", "abstract": _ABSTRACT}
    )
    assert "NeurIPS" in out["topics"]


def test_industry_hint_fires_on_domain_keyword():
    out = extractive_summary({"title": "Clinical ECG diagnosis", "abstract": _ABSTRACT})
    assert out["industry"] != _NOT_SPECIFIED  # "clinical"/"ecg" → healthcare beneficiary


def test_no_domain_keyword_leaves_industry_unspecified():
    out = extractive_summary(
        {"title": "On the Convergence of Gradient Descent", "abstract": "We prove a convergence bound."}
    )
    assert out["industry"] == _NOT_SPECIFIED


def test_model_constant_marks_llm_free_provenance():
    assert EXTRACTIVE_MODEL == "extractive"
