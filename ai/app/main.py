"""MLKD AI service — FastAPI application.

Run for development:  uvicorn app.main:app --reload --port 8000
"""

import logging
import os
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from app import metrics
from app.api.routes import router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

logger = logging.getLogger(__name__)


def _warm_up_embeddings() -> None:
    """Load the sentence-transformers model so the first visitor doesn't pay for it.

    The model loads lazily on first use, which made the first search after a
    restart take ~10s (and ~30s on a cold image that still had to download it).
    Warming happens in a background thread rather than blocking startup, so
    /health and every non-embedding endpoint answer immediately while the model
    loads alongside. Set EMBEDDING_WARMUP=0 to skip (e.g. offline environments).
    """
    if os.getenv("EMBEDDING_WARMUP", "1") not in {"1", "true", "True"}:
        logger.info("embedding warm-up disabled")
        return

    def _load() -> None:
        start = time.perf_counter()
        try:
            from app import embeddings

            embeddings.embed_texts(["warm up"])
            logger.info("embedding model warm in %.1fs", time.perf_counter() - start)
        except Exception as exc:  # noqa: BLE001 - warm-up is an optimisation, never fatal
            logger.warning("embedding warm-up failed (will load on first use): %s", exc)

    threading.Thread(target=_load, name="embedding-warmup", daemon=True).start()


@asynccontextmanager
async def lifespan(_: FastAPI):
    _warm_up_embeddings()
    yield


app = FastAPI(
    title="MLKD AI Service",
    description="Semantic search, summarization and content generation for the MLKD portal",
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def record_request_metrics(request: Request, call_next):
    """Time every request and record it for /metrics.

    The label is the matched route template (e.g. /publications/{slug}), not the
    raw URL, so path parameters don't explode metric cardinality. /metrics itself
    is excluded so scraping doesn't inflate the numbers it reports.
    """
    start = time.perf_counter()
    response = await call_next(request)
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    if path != "/metrics":
        metrics.record_request(
            request.method, path, response.status_code, (time.perf_counter() - start) * 1000
        )
    return response


app.include_router(router)
