"""Recompute publication embeddings for semantic search.

Run:  python -m app.pipelines.embed [--no-cluster]

Re-clusters the topic map afterwards when embeddings actually changed: the map is
a projection of these vectors, so leaving it alone means the /map page silently
describes an older corpus. Nothing else triggers clustering, and a stale map is
invisible — it renders happily with last month's papers.
"""

import argparse
import logging

from app import embeddings, payload_api

logger = logging.getLogger(__name__)


def run(*, recluster: bool = True) -> None:
    # Published only. A duplicate parked by the dedupe script keeps its row, and
    # embedding it would put a second point for the same paper on the map and a
    # second candidate in search — the duplication the parking exists to end.
    pubs = payload_api.find_all("publications", {"status": {"equals": "published"}})
    items: list[tuple[int, str]] = []
    for pub in pubs:
        text = f"{pub.get('title') or ''}\n\n{pub.get('abstract') or ''}".strip()
        if text:
            items.append((pub["id"], text))
    logger.info("embedding %s publications", len(items))
    written = embeddings.upsert_publication_embeddings(items)
    # A vector outlives the record it came from — a publication deleted in the
    # admin, or one parked as a merged duplicate, would otherwise stay in the map
    # and in search forever.
    removed = embeddings.prune_publication_embeddings([pub["id"] for pub in pubs])

    if not recluster:
        return
    if not written and not removed:
        logger.info("no embeddings changed — topic map left as is")
        return
    # Clustering is CPU-only and takes seconds at this corpus size, so it is
    # cheaper to always refresh than to explain a stale map later.
    from app.pipelines import cluster

    try:
        cluster.run()
    except Exception:
        # The embeddings are already written and searchable; a failed projection
        # must not make the whole embed run look failed.
        logger.exception("topic map refresh failed — run app.pipelines.cluster manually")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--no-cluster",
        action="store_true",
        help="Skip the topic-map refresh (useful when re-embedding in stages).",
    )
    args = parser.parse_args()
    run(recluster=not args.no_cluster)
