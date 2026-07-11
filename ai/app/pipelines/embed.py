"""Пересчёт эмбеддингов публикаций для семантического поиска.

Запуск:  python -m app.pipelines.embed
"""

import logging

from app import embeddings, payload_api

logger = logging.getLogger(__name__)


def run() -> None:
    pubs = payload_api.find_all("publications")
    items: list[tuple[int, str]] = []
    for pub in pubs:
        text = f"{pub.get('title') or ''}\n\n{pub.get('abstract') or ''}".strip()
        if text:
            items.append((pub["id"], text))
    logger.info("embedding %s publications", len(items))
    embeddings.upsert_publication_embeddings(items)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    run()
