"""Postgres-таблицы, которыми владеет AI-сервис (эмбеддинги, карта тем).

Контентными таблицами владеет Payload — сюда мы их не трогаем.
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
    """Создаёт расширение pgvector и таблицы под конкретную размерность модели."""
    with psycopg.connect(get_settings().database_url, autocommit=True) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS publication_embeddings (
                publication_id integer PRIMARY KEY,
                model text NOT NULL,
                embedding vector({dim}) NOT NULL,
                updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS member_embeddings (
                member_id integer PRIMARY KEY,
                model text NOT NULL,
                embedding vector({dim}) NOT NULL,
                updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
    logger.info("pgvector schema ensured (dim=%s)", dim)


def ensure_topic_map() -> None:
    """Таблица карты тем: 2D-координаты и кластер каждой публикации."""
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
