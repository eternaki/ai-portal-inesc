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
    # Все запросы AI-сервиса помечены: Payload-хук авто-обработки их пропускает
    # (иначе массовый ingest или запись саммари сами бы триггерили LLM-вызовы).
    headers = {"X-Skip-Autoprocess": "1"}
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
    # Матчим и по openalexId, и по DOI: OpenAlex иногда содержит две записи
    # (preprint + published) с одним DOI — это одна публикация для нас.
    conditions: list[dict[str, Any]] = []
    if data.get("openalexId"):
        conditions.append({"openalexId": {"equals": data["openalexId"]}})
    if data.get("doi"):
        conditions.append({"doi": {"equals": data["doi"]}})
    where: dict[str, Any] | None = {"or": conditions} if conditions else None

    existing = find("publications", where, limit=1)["docs"] if where else []
    if existing:
        doc = existing[0]
        safe_update = {
            k: v
            for k, v in data.items()
            if k in ("citationCount", "abstract", "pdfUrl", "venue", "authors", "referencedWorks")
        }
        return update("publications", doc["id"], safe_update), False

    try:
        return create("publications", data), True
    except httpx.HTTPStatusError as err:
        # Коллизия слага: у conference- и journal-версии статьи одинаковый заголовок.
        # Повторяем с уникализированным слагом (хук Payload его слагифицирует).
        if err.response.status_code == 400 and "slug" in err.response.text:
            suffix = data.get("openalexId") or data.get("doi") or str(data.get("year") or "")
            retry = {**data, "slug": f"{data['title']} {suffix}"}
            return create("publications", retry), True
        raise
