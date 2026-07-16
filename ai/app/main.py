"""MLKD AI service — FastAPI application.

Run for development:  uvicorn app.main:app --reload --port 8000
"""

import logging

from fastapi import FastAPI

from app.api.routes import router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="MLKD AI Service",
    description="Semantic search, summarization and content generation for the MLKD portal",
    version="0.1.0",
)

app.include_router(router)
