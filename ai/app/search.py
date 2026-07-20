"""Hybrid publication search: Postgres full-text + pgvector semantic, fused.

Full-text search reads the Payload-owned `publications` table READ-ONLY for
ranking (ts_rank). The architecture rule forbids *writing* content via SQL, not
reading it for a ranking signal; the alternative (pull every abstract over REST
and rank in Python) is strictly worse. All writes still go through payload_api.

Fusion is Reciprocal Rank Fusion (RRF): robust, score-scale-agnostic, and works
even when one of the two signals is missing (e.g. the LLM/embedding path is down,
leaving a pure textual fallback — a plan requirement).
"""

import logging

from app import db

logger = logging.getLogger(__name__)

# Text used for both indexing and matching. Bibliographic, English-tokenized.
_TS_EXPR = (
    "to_tsvector('english', coalesce(title,'') || ' ' || "
    "coalesce(abstract,'') || ' ' || coalesce(venue,''))"
)

_RRF_K = 60  # standard RRF damping constant


def fulltext_search(query: str, *, limit: int = 30) -> list[tuple[int, float]]:
    """Postgres FTS over published papers → [(publication_id, ts_rank)]."""
    sql = f"""
        SELECT id, ts_rank({_TS_EXPR}, plainto_tsquery('english', %s)) AS rank
        FROM publications
        WHERE status = 'published'
          AND {_TS_EXPR} @@ plainto_tsquery('english', %s)
        ORDER BY rank DESC
        LIMIT %s
    """
    try:
        with db.connect() as conn:
            rows = conn.execute(sql, (query, query, limit)).fetchall()
        return [(int(r[0]), float(r[1])) for r in rows]
    except Exception as exc:  # FTS is a best-effort signal; never fail the request
        logger.warning("fulltext_search failed: %s", exc)
        return []


def _rrf(rankings: list[list[int]]) -> dict[int, float]:
    """Reciprocal Rank Fusion over several ranked id lists → {id: fused_score}."""
    fused: dict[int, float] = {}
    for ids in rankings:
        for rank, pub_id in enumerate(ids):
            fused[pub_id] = fused.get(pub_id, 0.0) + 1.0 / (_RRF_K + rank + 1)
    return fused


def hybrid_search(
    query: str, *, limit: int = 10, semantic_limit: int = 30, use_semantic: bool = True
) -> list[int]:
    """Fuse semantic + full-text into one ranked list of publication ids.

    Degrades gracefully: if the semantic path is disabled (feature flag) or
    unavailable (torch not loaded, no embeddings), the result is the pure
    full-text ranking, and vice versa.
    """
    semantic_ids: list[int] = []
    if use_semantic:
        try:
            from app import embeddings  # lazy: pulls in torch

            semantic_ids = [
                pid for pid, _ in embeddings.search_publications(query, limit=semantic_limit)
            ]
        except Exception as exc:
            logger.warning("semantic search unavailable, using full-text only: %s", exc)

    fts_ids = [pid for pid, _ in fulltext_search(query, limit=semantic_limit)]

    fused = _rrf([semantic_ids, fts_ids])
    ranked = sorted(fused, key=lambda pid: -fused[pid])
    return ranked[:limit]
