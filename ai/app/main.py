"""MLKD AI service — FastAPI application.

Run for development:  uvicorn app.main:app --reload --port 8000
"""

import logging
import time

from fastapi import FastAPI, Request

from app import metrics
from app.api.routes import router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="MLKD AI Service",
    description="Semantic search, summarization and content generation for the MLKD portal",
    version="0.1.0",
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
