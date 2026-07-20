"""Search-quality benchmark: Precision@5, Recall@10, MRR, and latency.

Metrics are pure functions (unit-tested). The runner evaluates hybrid_search
against a labeled query set — a JSON file:

    [
      {"query": "privacy preserving machine learning", "relevant": [12, 88, 141]},
      ...
    ]

`relevant` holds the publication ids a human judged relevant. The ground truth
must be curated by hand (see ai/tests/benchmark_queries.example.json); we do not
fabricate relevance. Run:

    python -m app.pipelines.benchmark ai/tests/benchmark_queries.json
"""

import json
import logging
import sys
import time
from typing import Sequence

logger = logging.getLogger(__name__)


def precision_at_k(ranked: Sequence[int], relevant: set[int], k: int) -> float:
    if k <= 0:
        return 0.0
    top = ranked[:k]
    if not top:
        return 0.0
    return sum(1 for pid in top if pid in relevant) / k


def recall_at_k(ranked: Sequence[int], relevant: set[int], k: int) -> float:
    if not relevant:
        return 0.0
    top = ranked[:k]
    return sum(1 for pid in top if pid in relevant) / len(relevant)


def reciprocal_rank(ranked: Sequence[int], relevant: set[int]) -> float:
    """1/rank of the first relevant hit (0 if none)."""
    for i, pid in enumerate(ranked):
        if pid in relevant:
            return 1.0 / (i + 1)
    return 0.0


def evaluate(cases: list[dict]) -> dict:
    """Run hybrid_search per case and average the metrics. Includes latency."""
    from app import search as search_mod

    n = len(cases)
    if n == 0:
        return {"cases": 0}

    p5 = r10 = mrr = 0.0
    latencies: list[float] = []
    for case in cases:
        relevant = set(case.get("relevant") or [])
        t0 = time.monotonic()
        ranked = search_mod.hybrid_search(case["query"], limit=10)
        latencies.append((time.monotonic() - t0) * 1000)
        p5 += precision_at_k(ranked, relevant, 5)
        r10 += recall_at_k(ranked, relevant, 10)
        mrr += reciprocal_rank(ranked, relevant)

    latencies.sort()
    return {
        "cases": n,
        "precision_at_5": round(p5 / n, 4),
        "recall_at_10": round(r10 / n, 4),
        "mrr": round(mrr / n, 4),
        "latency_ms_avg": round(sum(latencies) / n, 1),
        "latency_ms_p50": round(latencies[n // 2], 1),
        "latency_ms_p95": round(latencies[min(int(n * 0.95), n - 1)], 1),
    }


def run(queries_file: str) -> dict:
    with open(queries_file, encoding="utf-8") as f:
        cases = json.load(f)
    report = evaluate(cases)
    logger.info("benchmark: %s", report)
    return report


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    path = sys.argv[1] if len(sys.argv) > 1 else "tests/benchmark_queries.json"
    print(json.dumps(run(path), indent=2))
