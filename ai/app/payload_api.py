"""Клиент Payload REST API.

Правило архитектуры: AI-сервис НЕ пишет в контентные таблицы Payload напрямую —
только через REST. Так саммари/био попадают в админку и остаются редактируемыми.
Аутентификация — API-ключ сервисного пользователя (коллекция users, role=editor).
"""

import json
from typing import Any

import httpx

from app.config import get_settings


def _client() -> httpx.Client:
    settings = get_settings()
    headers = {}
    if settings.payload_api_key:
        headers["Authorization"] = f"users API-Key {settings.payload_api_key}"
    return httpx.Client(
        base_url=f"{settings.payload_url}/api",
        headers=headers,
        timeout=30.0,
    )


def find(collection: str, where: dict[str, Any] | None = None, *, limit: int = 100, page: int = 1, depth: int = 0) -> dict:
    params: dict[str, Any] = {"limit": limit, "page": page, "depth": depth}
    if where:
        params["where"] = json.dumps(where)
    with _client() as client:
        resp = client.get(f"/{collection}", params=params)
        resp.raise_for_status()
        return resp.json()


def find_all(collection: str, where: dict[str, Any] | None = None, *, depth: int = 0) -> list[dict]:
    """Все документы коллекции с пагинацией."""
    docs: list[dict] = []
    page = 1
    while True:
        data = find(collection, where, limit=100, page=page, depth=depth)
        docs.extend(data["docs"])
        if not data.get("hasNextPage"):
            return docs
        page += 1


def create(collection: str, data: dict) -> dict:
    with _client() as client:
        resp = client.post(f"/{collection}", json=data)
        resp.raise_for_status()
        return resp.json()["doc"]


def update(collection: str, doc_id: int | str, data: dict) -> dict:
    with _client() as client:
        resp = client.patch(f"/{collection}/{doc_id}", json=data)
        resp.raise_for_status()
        return resp.json()["doc"]


def upsert_publication(data: dict) -> tuple[dict, bool]:
    """Создать или обновить публикацию. Матчинг: openalexId, затем DOI.

    Возвращает (документ, created). Поля, которые человек мог править руками
    (aiSummary, verified, ...), при обновлении не трогаем.
    """
    where: dict[str, Any] | None = None
    if data.get("openalexId"):
        where = {"openalexId": {"equals": data["openalexId"]}}
    elif data.get("doi"):
        where = {"doi": {"equals": data["doi"]}}

    existing = find("publications", where, limit=1)["docs"] if where else []
    if existing:
        doc = existing[0]
        safe_update = {
            k: v
            for k, v in data.items()
            if k in ("citationCount", "abstract", "pdfUrl", "venue", "authors")
        }
        return update("publications", doc["id"], safe_update), False
    return create("publications", data), True
