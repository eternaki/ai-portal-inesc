"""Multi-entity embedding pipeline.

Embeds every semantically searchable entity (publications, members, projects,
thesis topics) into the unified `entity_embeddings` store, so search can span
entity types. Idempotent — only changed content is re-embedded (content_hash).

Run:  python -m app.pipelines.embed_entities            # all types
      python -m app.pipelines.embed_entities members    # one type
"""

import logging
import sys

from app import embeddings, payload_api
from app.entities import ENTITY_ADAPTERS, PUBLISHED_ONLY

logger = logging.getLogger(__name__)


def run(types: list[str] | None = None, *, force: bool = False) -> dict[str, int]:
    types = types or list(ENTITY_ADAPTERS)
    written: dict[str, int] = {}
    for entity_type in types:
        adapter = ENTITY_ADAPTERS.get(entity_type)
        if not adapter:
            logger.warning("no adapter for %s, skipping", entity_type)
            continue
        # Only embed published publications; other entity types are public content.
        where = {"status": {"equals": "published"}} if entity_type in PUBLISHED_ONLY else None
        docs = payload_api.find_all(entity_type, where=where, depth=0)
        items = [(d["id"], adapter(d)) for d in docs]
        items = [(eid, text) for eid, text in items if text.strip()]
        written[entity_type] = embeddings.upsert_entity_embeddings(entity_type, items, force=force)
        logger.info("%s: %s docs with text, %s embedded", entity_type, len(items), written[entity_type])
    return written


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv
    print(json.dumps(run(args or None, force=force), indent=2))
