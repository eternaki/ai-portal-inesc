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


def ann_recall(*, k: int = 10, sample: int | None = None) -> dict:
    """Label-free search-quality metric: recall of the ANN (HNSW) index vs exact kNN.

    Human relevance labels are expensive, so this measures the one thing the ANN
    conversion can regress without anyone noticing: whether the approximate index
    returns the same neighbours as an exact scan. Stored publication embeddings are
    reused as query vectors; for each we compare the index-served top-k against the
    brute-force top-k (index disabled = exact ground truth) and average the overlap.

    recall≈1.0 means ANN matches exact search; a low value means ef_search is too
    small for k. Runs on any embedded corpus, so it is the quantitative search
    check we can always produce (complementing the hand-labelled P@K/MRR harness).
    """
    from app import db, embeddings

    with db.connect() as conn:
        ids = [
            row[0]
            for row in conn.execute(
                "SELECT publication_id FROM publication_embeddings ORDER BY publication_id"
            ).fetchall()
        ]
    if not ids:
        return {"sample": 0, "recall": None, "note": "no publication embeddings to evaluate"}
    if sample and sample < len(ids):
        step = max(1, len(ids) // sample)
        ids = ids[::step][:sample]

    order_sql = (
        "SELECT publication_id FROM publication_embeddings "
        "ORDER BY embedding <=> %s::vector LIMIT %s"
    )
    hits = total = 0
    latencies: list[float] = []
    for pid in ids:
        with db.connect() as conn:
            vec = conn.execute(
                "SELECT embedding FROM publication_embeddings WHERE publication_id = %s",
                (pid,),
            ).fetchone()[0]
            # Exact ground truth: force a brute-force scan by disabling index access.
            conn.execute("SET enable_indexscan = off")
            conn.execute("SET enable_bitmapscan = off")
            exact = {row[0] for row in conn.execute(order_sql, (vec, k)).fetchall()}
        with db.connect() as conn:
            embeddings._apply_ann_tuning(conn)
            t0 = time.monotonic()
            ann = {row[0] for row in conn.execute(order_sql, (vec, k)).fetchall()}
            latencies.append((time.monotonic() - t0) * 1000)
        hits += len(exact & ann)
        total += len(exact)

    latencies.sort()
    return {
        "sample": len(ids),
        "k": k,
        "recall": round(hits / total, 4) if total else 0.0,
        "ann_latency_ms_p50": round(latencies[len(latencies) // 2], 2) if latencies else 0.0,
    }


def run(queries_file: str) -> dict:
    with open(queries_file, encoding="utf-8") as f:
        cases = json.load(f)
    report = evaluate(cases)
    logger.info("benchmark: %s", report)
    return report


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    # `--ann` measures ANN-vs-exact recall on the live corpus (no labels needed);
    # otherwise run the hand-labelled Precision@K / Recall@K / MRR harness.
    if "--ann" in sys.argv:
        print(json.dumps(ann_recall(), indent=2))
    else:
        path = next((a for a in sys.argv[1:] if not a.startswith("-")), "tests/benchmark_queries.json")
        print(json.dumps(run(path), indent=2))
