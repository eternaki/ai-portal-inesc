"""Локальные эмбеддинги (sentence-transformers) + запись в pgvector.

Модель загружается лениво: импорт torch тяжёлый, и он не нужен, если сервис
запущен только ради генерации сниппетов.
"""

import logging
from functools import lru_cache

from app import db
from app.config import get_settings

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


def upsert_publication_embeddings(items: list[tuple[int, str]]) -> None:
    """items: [(publication_id, text)] — считает и сохраняет эмбеддинги."""
    if not items:
        return
    model_name = get_settings().embedding_model
    vectors = embed_texts([text for _, text in items])
    db.ensure_schema(embedding_dim())
    with db.connect() as conn:
        for (pub_id, _), vec in zip(items, vectors):
            conn.execute(
                """
                INSERT INTO publication_embeddings (publication_id, model, embedding, updated_at)
                VALUES (%s, %s, %s, now())
                ON CONFLICT (publication_id)
                DO UPDATE SET model = EXCLUDED.model,
                              embedding = EXCLUDED.embedding,
                              updated_at = now()
                """,
                (pub_id, model_name, vec),
            )
    logger.info("upserted %s publication embeddings", len(items))


def search_publications(query: str, *, limit: int = 10) -> list[tuple[int, float]]:
    """Семантический поиск: [(publication_id, score)], score — косинусная близость."""
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
