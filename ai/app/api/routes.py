"""HTTP-эндпоинты AI-сервиса.

Рантайм-зависимость сайта от LLM минимальна: /search работает только на
pgvector (LLM не вызывается); /generate/* вызываются вручную из админки.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import payload_api
from app.llm.client import complete_json, load_prompt

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/search")
def search(q: str, limit: int = 10) -> dict:
    """Семантический поиск по публикациям (эмбеддинги, без LLM)."""
    from app import embeddings  # ленивый импорт: тянет torch

    hits = embeddings.search_publications(q, limit=limit)
    if not hits:
        return {"query": q, "results": []}

    ids = [pub_id for pub_id, _ in hits]
    docs = payload_api.find(
        "publications", where={"id": {"in": ids}}, limit=len(ids)
    )["docs"]
    by_id = {doc["id"]: doc for doc in docs}
    results = [
        {"score": round(score, 4), "publication": by_id[pub_id]}
        for pub_id, score in hits
        if pub_id in by_id
    ]
    return {"query": q, "results": results}


class SnippetRequest(BaseModel):
    collection: str  # "publications" | "news"
    id: int
    save: bool = True


@router.post("/generate/snippet")
def generate_snippet(req: SnippetRequest) -> dict:
    """Генерирует текст поста для LinkedIn/X по публикации или новости."""
    if req.collection not in ("publications", "news"):
        raise HTTPException(400, "collection must be 'publications' or 'news'")

    docs = payload_api.find(req.collection, where={"id": {"equals": req.id}}, limit=1)["docs"]
    if not docs:
        raise HTTPException(404, f"{req.collection}/{req.id} not found")
    doc = docs[0]

    if req.collection == "publications":
        details = f"{doc.get('venue') or ''} {doc.get('year') or ''}. {doc.get('abstract') or ''}"
        kind = "research paper"
    else:
        details = str(doc.get("title") or "")
        kind = "news item"

    data = complete_json(
        load_prompt("snippet", kind=kind, title=doc.get("title") or "", details=details[:2000])
    )
    snippet = f"LinkedIn:\n{data.get('linkedin', '')}\n\nX:\n{data.get('x', '')}"

    if req.save:
        payload_api.update(req.collection, req.id, {"socialSnippet": snippet})

    return {"snippet": snippet, **data}
