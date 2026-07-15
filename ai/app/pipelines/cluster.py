"""Карта тем: UMAP-проекция эмбеддингов публикаций + HDBSCAN-кластеры.

Запуск:  python -m app.pipelines.cluster

Из ТЗ (раздел A/E): «visual summaries (research areas map, topic clusters)» +
«AI-powered algorithm to periodically re-generate the visuals». Пайплайн
детерминирован (random_state) и запускается заново после каждого ingest/embed.
Метки кластеров — топ-термины TF-IDF по заголовкам и abstract (без LLM-вызовов).
"""

import logging

import numpy as np

from app import db, payload_api

logger = logging.getLogger(__name__)


def _cluster_labels(texts_by_cluster: dict[int, list[str]]) -> dict[int, str]:
    """Топ-3 TF-IDF термина на кластер — быстрые и бесплатные метки."""
    from sklearn.feature_extraction.text import TfidfVectorizer

    cluster_ids = sorted(texts_by_cluster)
    corpus = [" ".join(texts_by_cluster[c]) for c in cluster_ids]
    if not corpus:
        return {}
    vec = TfidfVectorizer(stop_words="english", max_features=4000, ngram_range=(1, 2))
    matrix = vec.fit_transform(corpus)
    terms = np.array(vec.get_feature_names_out())
    labels: dict[int, str] = {}
    for row, cluster_id in enumerate(cluster_ids):
        weights = matrix[row].toarray().ravel()
        top = terms[np.argsort(weights)[::-1][:3]]
        labels[cluster_id] = " · ".join(top)
    return labels


def run() -> None:
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT publication_id, embedding FROM publication_embeddings"
        ).fetchall()
    if len(rows) < 10:
        logger.warning("too few embeddings (%s) — run app.pipelines.embed first", len(rows))
        return

    ids = [r[0] for r in rows]
    # pgvector отдаёт объект Vector — приводим к numpy
    X = np.array(
        [
            r[1].to_numpy() if hasattr(r[1], "to_numpy") else np.asarray(r[1].to_list())
            for r in rows
        ],
        dtype=np.float32,
    )
    logger.info("clustering %s publications (dim=%s)", X.shape[0], X.shape[1])

    # Кластеры — на исходных нормированных эмбеддингах (евклид ≈ косинус)
    from sklearn.cluster import HDBSCAN

    cluster_ids = HDBSCAN(min_cluster_size=6).fit_predict(X)

    # 2D-проекция для отображения
    import umap

    coords = umap.UMAP(
        n_components=2, n_neighbors=15, min_dist=0.15, metric="cosine", random_state=42
    ).fit_transform(X)

    # Метки кластеров по текстам публикаций
    pubs = {p["id"]: p for p in payload_api.find_all("publications")}
    texts_by_cluster: dict[int, list[str]] = {}
    for pub_id, cluster in zip(ids, cluster_ids):
        if cluster == -1:  # шум HDBSCAN — без метки
            continue
        pub = pubs.get(pub_id)
        if pub:
            text = f"{pub.get('title') or ''} {pub.get('abstract') or ''}"
            texts_by_cluster.setdefault(int(cluster), []).append(text)
    labels = _cluster_labels(texts_by_cluster)

    db.ensure_topic_map()
    with db.connect() as conn:
        conn.execute("DELETE FROM topic_map")
        for pub_id, cluster, (x, y) in zip(ids, cluster_ids, coords):
            conn.execute(
                """
                INSERT INTO topic_map (publication_id, cluster_id, x, y, label)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (pub_id, int(cluster), float(x), float(y), labels.get(int(cluster))),
            )

    n_clusters = len(labels)
    noise = int(np.sum(cluster_ids == -1))
    logger.info("done: %s clusters, %s noise points", n_clusters, noise)
    for cid, label in sorted(labels.items()):
        logger.info("  cluster %s: %s (%s pubs)", cid, label, len(texts_by_cluster[cid]))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    run()
