"""Integration tests for the pgvector ANN (HNSW) conversion.

These need a live PostgreSQL with the pgvector extension (>= 0.5 for HNSW). They
skip cleanly when no database is reachable, so the pure unit suite still runs
anywhere; CI provides a pgvector service so these actually execute.

Two things are verified:
  1. db.ensure_schema creates HNSW indexes on both embedding tables.
  2. On a throwaway table, the HNSW index is (a) used by the planner and
     (b) accurate — its top-k matches an exact brute-force scan (recall >= 0.9).

The throwaway table keeps the test from touching real/seed embeddings locally.
"""

import numpy as np
import pytest

psycopg = pytest.importorskip("psycopg")
from pgvector.psycopg import register_vector  # noqa: E402

from app.config import get_settings  # noqa: E402

DIM = 384          # matches the sentence-transformers model in production
N_ROWS = 2000      # enough that the planner prefers the ANN index over a seq scan
K = 10
EF_SEARCH = 100


def _connect():
    try:
        conn = psycopg.connect(get_settings().database_url, autocommit=True, connect_timeout=3)
    except Exception as err:  # noqa: BLE001 - no DB in this environment → skip, don't fail
        pytest.skip(f"no database available for integration test: {err}")
    # The pgvector adapter can only register once the `vector` type exists, so the
    # extension must be created before register_vector (a fresh DB has neither).
    try:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    except Exception as err:  # noqa: BLE001
        conn.close()
        pytest.skip(f"pgvector extension unavailable: {err}")
    register_vector(conn)
    return conn


def _unit_rows(n: int, dim: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.standard_normal((n, dim)).astype(np.float32)
    v /= np.linalg.norm(v, axis=1, keepdims=True)  # L2-normalized, like the real embeddings
    return v


@pytest.fixture(scope="module")
def conn():
    c = _connect()
    # pgvector must be installed and support HNSW.
    try:
        c.execute("CREATE EXTENSION IF NOT EXISTS vector")
    except Exception as err:  # noqa: BLE001
        pytest.skip(f"pgvector extension unavailable: {err}")
    yield c
    c.close()


def test_ensure_schema_creates_hnsw_indexes(conn):
    from app import db

    db.ensure_schema(DIM)
    rows = conn.execute(
        "SELECT indexname, indexdef FROM pg_indexes "
        "WHERE indexname IN ('publication_embeddings_hnsw_idx', 'entity_embeddings_hnsw_idx')"
    ).fetchall()
    defs = {name: definition for name, definition in rows}
    assert "publication_embeddings_hnsw_idx" in defs
    assert "entity_embeddings_hnsw_idx" in defs
    # Must be an HNSW index over the cosine opclass (matches the `<=>` queries).
    for definition in defs.values():
        assert "hnsw" in definition.lower()
        assert "vector_cosine_ops" in definition


@pytest.fixture(scope="module")
def ann_table(conn):
    """A throwaway HNSW-indexed table so we never touch real embeddings."""
    conn.execute("DROP TABLE IF EXISTS test_ann_vectors")
    conn.execute(f"CREATE TABLE test_ann_vectors (id integer PRIMARY KEY, embedding vector({DIM}))")
    rows = _unit_rows(N_ROWS, DIM, seed=1)
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO test_ann_vectors (id, embedding) VALUES (%s, %s)",
            [(i, rows[i]) for i in range(N_ROWS)],
        )
    conn.execute(
        "CREATE INDEX test_ann_vectors_hnsw_idx ON test_ann_vectors "
        "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)"
    )
    conn.execute("ANALYZE test_ann_vectors")
    yield conn
    conn.execute("DROP TABLE IF EXISTS test_ann_vectors")


def test_planner_uses_hnsw_index(ann_table):
    query = _unit_rows(1, DIM, seed=99)[0]
    plan = "\n".join(
        r[0]
        for r in ann_table.execute(
            "EXPLAIN SELECT id FROM test_ann_vectors ORDER BY embedding <=> %s::vector LIMIT %s",
            (query, K),
        ).fetchall()
    )
    # The whole point of ANN: the ordered-limit query is served by the HNSW index,
    # not a sequential scan + full sort.
    assert "test_ann_vectors_hnsw_idx" in plan, f"expected HNSW index scan, got:\n{plan}"


def test_ann_recall_matches_exact(ann_table):
    order_sql = "SELECT id FROM test_ann_vectors ORDER BY embedding <=> %s::vector LIMIT %s"
    queries = _unit_rows(20, DIM, seed=7)

    hits = total = 0
    for q in queries:
        ann_table.execute("SET enable_indexscan = off")
        ann_table.execute("SET enable_bitmapscan = off")
        exact = {r[0] for r in ann_table.execute(order_sql, (q, K)).fetchall()}

        ann_table.execute("SET enable_indexscan = on")
        ann_table.execute("SET enable_bitmapscan = on")
        ann_table.execute(f"SET hnsw.ef_search = {EF_SEARCH}")
        approx = {r[0] for r in ann_table.execute(order_sql, (q, K)).fetchall()}

        hits += len(exact & approx)
        total += len(exact)

    recall = hits / total
    assert recall >= 0.9, f"ANN recall too low: {recall:.3f} (ef_search={EF_SEARCH}, k={K})"
