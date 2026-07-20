"""Local embeddings (sentence-transformers) written to pgvector.

The model loads lazily: importing torch is heavy and unnecessary when the
service is running only to generate snippets.
"""

import hashlib
import logging
from functools import lru_cache

from app import db
from app.config import get_settings


def _content_hash(text: str, model: str) -> str:
    """Stable fingerprint of (source text + model) — changes trigger re-embedding."""
    return hashlib.sha256(f"{model}\x00{text}".encode("utf-8")).hexdigest()

logger = logging.getLogger(__name__)


@lru_cache
def _model():
    from sentence_transformers import SentenceTransformer

    name = get_settings().embedding_model
    logger.info("loading embedding model %s", name)
    return SentenceTransformer(name)


def embed_texts(texts: list[str]) -> list[list[float]]:
    return _model().encode(texts, normalize_embeddings=True).tolist()


def embedding_dim() -> int:
    return _model().get_sentence_embedding_dimension()


def upsert_publication_embeddings(
    items: list[tuple[int, str]], *, force: bool = False
) -> int:
    """items: [(publication_id, text)] — embed and store. Returns rows written.

    Skips items whose (text, model) hash already matches the stored one, so
    re-running the pipeline only re-embeds changed content. Pass force=True to
    recompute regardless (e.g. after switching the embedding model deliberately).
    """
    if not items:
        return 0
    model_name = get_settings().embedding_model
    db.ensure_schema(embedding_dim())

    # Filter to items that actually need (re)embedding.
    with db.connect() as conn:
        existing = {
            row[0]: row[1]
            for row in conn.execute(
                "SELECT publication_id, content_hash FROM publication_embeddings "
                "WHERE publication_id = ANY(%s)",
                ([pid for pid, _ in items],),
            ).fetchall()
        }
    todo = [
        (pid, text, _content_hash(text, model_name))
        for pid, text in items
        if force or existing.get(pid) != _content_hash(text, model_name)
    ]
    if not todo:
        logger.info("embeddings up to date, nothing to do (%s items)", len(items))
        return 0

    vectors = embed_texts([text for _, text, _ in todo])
    with db.connect() as conn:
        for (pub_id, _, chash), vec in zip(todo, vectors):
            conn.execute(
                """
                INSERT INTO publication_embeddings (publication_id, model, embedding, content_hash, updated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (publication_id)
                DO UPDATE SET model = EXCLUDED.model,
                              embedding = EXCLUDED.embedding,
                              content_hash = EXCLUDED.content_hash,
                              updated_at = now()
                """,
                (pub_id, model_name, vec, chash),
            )
    logger.info("upserted %s publication embeddings (%s skipped)", len(todo), len(items) - len(todo))
    return len(todo)


def search_publications(query: str, *, limit: int = 10) -> list[tuple[int, float]]:
    """Semantic search: [(publication_id, score)], score is cosine similarity."""
    vec = embed_texts([query])[0]
    with db.connect() as conn:
        rows = conn.execute(
            """
            SELECT publication_id, 1 - (embedding <=> %s::vector) AS score
            FROM publication_embeddings
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (vec, vec, limit),
        ).fetchall()
    return [(row[0], float(row[1])) for row in rows]
