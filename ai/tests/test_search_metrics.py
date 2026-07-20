"""Unit tests for the benchmark metric functions (pure, no DB/LLM needed)."""

from app.pipelines.benchmark import precision_at_k, recall_at_k, reciprocal_rank
from app.search import _rrf


def test_precision_at_k():
    ranked = [1, 2, 3, 4, 5]
    relevant = {2, 4, 9}
    assert precision_at_k(ranked, relevant, 5) == 2 / 5
    assert precision_at_k(ranked, relevant, 2) == 1 / 2
    assert precision_at_k(ranked, set(), 5) == 0.0
    assert precision_at_k(ranked, relevant, 0) == 0.0


def test_recall_at_k():
    ranked = [1, 2, 3, 4, 5]
    relevant = {2, 4, 9}
    assert recall_at_k(ranked, relevant, 10) == 2 / 3
    assert recall_at_k(ranked, {2}, 10) == 1.0
    assert recall_at_k(ranked, set(), 10) == 0.0


def test_reciprocal_rank():
    assert reciprocal_rank([1, 2, 3], {2}) == 1 / 2
    assert reciprocal_rank([5, 2, 3], {5}) == 1.0
    assert reciprocal_rank([1, 2, 3], {9}) == 0.0


def test_rrf_prefers_items_ranked_high_in_both_lists():
    # id 3 appears near the top of both lists → should win.
    fused = _rrf([[3, 1, 2], [3, 2, 1]])
    ranked = sorted(fused, key=lambda pid: -fused[pid])
    assert ranked[0] == 3


def test_rrf_handles_missing_signal():
    # One list empty (e.g. semantic path down) → still ranks the other.
    fused = _rrf([[], [7, 8, 9]])
    ranked = sorted(fused, key=lambda pid: -fused[pid])
    assert ranked == [7, 8, 9]
