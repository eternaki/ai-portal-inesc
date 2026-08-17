"""Embeddings for deleted content must not outlive it.

Nothing used to remove an embedding: the upsert path only ever adds. Merging two
duplicate publications, or unpublishing one, left its vector in place — still
retrieved, then silently dropped when Payload could not resolve it, so the hit
never showed up in the results but had already taken a slot.

These run against a live pgvector database and skip cleanly without one, like
test_ann_search. They use synthetic entity types / ids far outside the real range
so they can never touch actual rows.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from app import db, embeddings  # noqa: E402
from app.config import get_settings  # noqa: E402

TYPE = "__prune_test__"
OTHER_TYPE = "__prune_test_other__"


@pytest.fixture
def conn():
    try:
        connection = psycopg.connect(get_settings().database_url, autocommit=True, connect_timeout=3)
    except Exception as err:  # noqa: BLE001 - no DB here → skip, don't fail
        pytest.skip(f"no database available for integration test: {err}")
    db.ensure_schema(embeddings.embedding_dim())
    _clear(connection)
    yield connection
    _clear(connection)
    connection.close()


def _clear(connection):
    connection.execute(
        "DELETE FROM entity_embeddings WHERE entity_type IN (%s, %s)", (TYPE, OTHER_TYPE)
    )


def _seed(connection, entity_type, ids):
    dim = embeddings.embedding_dim()
    for eid in ids:
        connection.execute(
            "INSERT INTO entity_embeddings (entity_type, entity_id, model, embedding, content_hash, updated_at) "
            "VALUES (%s, %s, 'test', %s, 'h', now()) ON CONFLICT (entity_type, entity_id) DO NOTHING",
            (entity_type, eid, "[" + ",".join(["0"] * dim) + "]"),
        )


def _ids(connection, entity_type):
    return sorted(
        row[0]
        for row in connection.execute(
            "SELECT entity_id FROM entity_embeddings WHERE entity_type = %s", (entity_type,)
        ).fetchall()
    )


def test_embeddings_for_deleted_entities_are_removed(conn):
    _seed(conn, TYPE, [1, 2, 3, 4])
    removed = embeddings.prune_entity_embeddings(TYPE, [1, 3])
    assert removed == 2
    assert _ids(conn, TYPE) == [1, 3]


def test_pruning_one_type_leaves_the_others_alone(conn):
    # entity_embeddings is one table for every collection; a prune of publications
    # must not touch members.
    _seed(conn, TYPE, [1, 2])
    _seed(conn, OTHER_TYPE, [1, 2])
    embeddings.prune_entity_embeddings(TYPE, [])
    assert _ids(conn, TYPE) == []
    assert _ids(conn, OTHER_TYPE) == [1, 2]


def test_pruning_is_a_no_op_when_nothing_is_orphaned(conn):
    _seed(conn, TYPE, [1, 2])
    assert embeddings.prune_entity_embeddings(TYPE, [1, 2]) == 0
    assert _ids(conn, TYPE) == [1, 2]


def test_an_empty_live_set_clears_the_type(conn):
    # A collection emptied on purpose must lose its vectors too. This is only safe
    # because callers pass payload_api.find_all's result, which either returns the
    # complete set or raises — it never reports empty because a request failed.
    _seed(conn, TYPE, [1, 2, 3])
    assert embeddings.prune_entity_embeddings(TYPE, []) == 3
    assert _ids(conn, TYPE) == []


def test_publication_embeddings_are_pruned_too(conn):
    # The legacy per-publication table backs the topic map and is fed by a
    # different pipeline, so it needs the same treatment.
    dim = embeddings.embedding_dim()
    ids = [900001, 900002, 900003]
    for pid in ids:
        conn.execute(
            "INSERT INTO publication_embeddings (publication_id, model, embedding, content_hash, updated_at) "
            "VALUES (%s, 'test', %s, 'h', now()) ON CONFLICT (publication_id) DO NOTHING",
            (pid, "[" + ",".join(["0"] * dim) + "]"),
        )
    try:
        live = [row[0] for row in conn.execute("SELECT publication_id FROM publication_embeddings").fetchall()]
        keep = [i for i in live if i not in (900002, 900003)]
        removed = embeddings.prune_publication_embeddings(keep)
        assert removed == 2
        remaining = [row[0] for row in conn.execute("SELECT publication_id FROM publication_embeddings").fetchall()]
        assert 900001 in remaining and 900002 not in remaining and 900003 not in remaining
    finally:
        conn.execute("DELETE FROM publication_embeddings WHERE publication_id = ANY(%s)", (ids,))
