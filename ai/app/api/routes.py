"""HTTP-эндпоинты AI-сервиса.

Рантайм-зависимость сайта от LLM минимальна: /search работает только на
pgvector (LLM не вызывается); /generate/* вызываются вручную из админки.
"""

import logging
import secrets

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app import payload_api
from app.config import get_settings
from app.llm.client import complete_json, load_prompt

logger = logging.getLogger(__name__)

router = APIRouter()


def require_service_token(x_service_token: str | None) -> None:
    """Мутирующие эндпоинты (LLM-вызовы за деньги + запись в CMS) требуют токен.

    AI_SERVICE_TOKEN обязателен: без него в конфиге мутирующие эндпоинты отключены.
    """
    expected = get_settings().ai_service_token
    if not expected:
        raise HTTPException(503, "AI_SERVICE_TOKEN is not configured; endpoint disabled")
    if not x_service_token or not secrets.compare_digest(x_service_token, expected):
        raise HTTPException(401, "invalid or missing X-Service-Token header")


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/search")
def search(q: str, limit: int = 10) -> dict:
    """Семантический поиск по публикациям (эмбеддинги, без LLM)."""
    if len(q) > 500 or not q.strip():
        raise HTTPException(400, "query must be 1..500 chars")
    limit = max(1, min(limit, 50))
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


@router.get("/map")
def topic_map() -> dict:
    """Карта тем: 2D-точки публикаций с кластерами (пайплайн cluster.py)."""
    from app import db

    try:
        with db.connect() as conn:
            rows = conn.execute(
                "SELECT publication_id, cluster_id, x, y, label FROM topic_map"
            ).fetchall()
    except Exception:
        rows = []
    if not rows:
        return {"points": [], "clusters": []}

    pubs = {p["id"]: p for p in payload_api.find_all("publications")}
    points = []
    clusters: dict[int, dict] = {}
    for pub_id, cluster_id, x, y, label in rows:
        pub = pubs.get(pub_id)
        if not pub:
            continue
        points.append(
            {
                "x": x,
                "y": y,
                "cluster": cluster_id,
                "publication": {
                    "id": pub_id,
                    "title": pub.get("title"),
                    "slug": pub.get("slug"),
                    "year": pub.get("year"),
                },
            }
        )
        if cluster_id != -1:
            entry = clusters.setdefault(cluster_id, {"id": cluster_id, "label": label, "count": 0})
            entry["count"] += 1
    return {"points": points, "clusters": sorted(clusters.values(), key=lambda c: -c["count"])}


class ProcessRequest(BaseModel):
    id: int


@router.post("/process/publication")
def process_publication(req: ProcessRequest, x_service_token: str | None = Header(None)) -> dict:
    """Обработать одну публикацию: саммари (если есть abstract и статус none) + эмбеддинг.

    Вызывается автоматически Payload-хуком при добавлении/правке публикации.
    Идемпотентно: не перегенерирует уже сгенерированное или отредактированное саммари.
    """
    require_service_token(x_service_token)
    from app import embeddings  # ленивый импорт: тянет torch
    from app.pipelines.summarize import summarize_publication

    docs = payload_api.find("publications", where={"id": {"equals": req.id}}, limit=1)["docs"]
    if not docs:
        raise HTTPException(404, f"publications/{req.id} not found")
    pub = docs[0]

    summarized = False
    if (pub.get("abstract") or "").strip() and pub.get("aiSummaryStatus") == "none":
        summary = summarize_publication(pub)
        payload_api.update(
            "publications", pub["id"], {"aiSummary": summary, "aiSummaryStatus": "generated"}
        )
        summarized = True

    embedded = False
    text = f"{pub.get('title') or ''}\n\n{pub.get('abstract') or ''}".strip()
    if text:
        embeddings.upsert_publication_embeddings([(pub["id"], text)])
        embedded = True

    return {"id": req.id, "summarized": summarized, "embedded": embedded}


class SnippetRequest(BaseModel):
    collection: str  # "publications" | "news"
    id: int
    save: bool = True


@router.post("/generate/snippet")
def generate_snippet(req: SnippetRequest, x_service_token: str | None = Header(None)) -> dict:
    """Генерирует текст поста для LinkedIn/X по публикации или новости."""
    require_service_token(x_service_token)
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
    # LLM-вывод строится на внешних данных (OpenAlex abstracts) — считаем его
    # недоверенным: храним как plain text и ограничиваем длину
    linkedin = str(data.get("linkedin", ""))[:1500]
    x_post = str(data.get("x", ""))[:300]
    snippet = f"LinkedIn:\n{linkedin}\n\nX:\n{x_post}"

    if req.save:
        payload_api.update(req.collection, req.id, {"socialSnippet": snippet})

    return {"snippet": snippet, **data}
