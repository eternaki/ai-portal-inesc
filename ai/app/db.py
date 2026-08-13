"""Postgres tables owned by the AI service (embeddings, topic map).

Content tables are owned by Payload — we never touch them here.
"""

import logging

import psycopg
from pgvector.psycopg import register_vector

from app.config import get_settings

logger = logging.getLogger(__name__)


def connect() -> psycopg.Connection:
    conn = psycopg.connect(get_settings().database_url, autocommit=True)
    register_vector(conn)
    return conn


def ensure_schema(dim: int) -> None:
    """Create the pgvector extension and tables sized to the model's dimension."""
    with psycopg.connect(get_settings().database_url, autocommit=True) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS publication_embeddings (
                publication_id integer PRIMARY KEY,
                model text NOT NULL,
                embedding vector({dim}) NOT NULL,
                content_hash text,
                updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        # Track the hashed source text + model so we re-embed only on change
        # (idempotent pipeline; cheap incremental re-runs).
        conn.execute(
            "ALTER TABLE publication_embeddings ADD COLUMN IF NOT EXISTS content_hash text"
        )
        # Unified vector store for the multi-entity embedding pipeline: one space
        # for publications, members, projects, thesis topics — so semantic search
        # can span entity types. (entity_type, entity_id) is the Payload
        # collection slug + document id. content_hash skips unchanged re-embeds.
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS entity_embeddings (
                entity_type text NOT NULL,
                entity_id integer NOT NULL,
                model text NOT NULL,
                embedding vector({dim}) NOT NULL,
                content_hash text,
                updated_at timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY (entity_type, entity_id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS entity_embeddings_type_idx ON entity_embeddings (entity_type)"
        )
        # Approximate-nearest-neighbour (HNSW) indexes so semantic search uses the
        # index instead of a full brute-force scan. vector_cosine_ops matches the
        # `<=>` (cosine) operator used by the search queries; m / ef_construction
        # come from config. HNSW (unlike IVFFlat) needs no training data, so it is
        # safe to create here before any rows exist. Requires pgvector >= 0.5.
        s = get_settings()
        m, ef_construction = int(s.hnsw_m), int(s.hnsw_ef_construction)
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS publication_embeddings_hnsw_idx "
            f"ON publication_embeddings USING hnsw (embedding vector_cosine_ops) "
            f"WITH (m = {m}, ef_construction = {ef_construction})"
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS entity_embeddings_hnsw_idx "
            f"ON entity_embeddings USING hnsw (embedding vector_cosine_ops) "
            f"WITH (m = {m}, ef_construction = {ef_construction})"
        )
    logger.info("pgvector schema ensured (dim=%s)", dim)


def ensure_topic_map() -> None:
    """Topic-map table: 2D coordinates and the cluster of each publication."""
    with psycopg.connect(get_settings().database_url, autocommit=True) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS topic_map (
                publication_id integer PRIMARY KEY,
                cluster_id integer NOT NULL,
                x real NOT NULL,
                y real NOT NULL,
                label text,
                computed_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
