"""Генерация AI-черновиков био для членов группы.

Запуск:  python -m app.pipelines.bios [--limit N] [--force]

Для членов без bioAiDraft собирает их публикации (по связи authors.member),
генерирует черновик и пишет его в поле bioAiDraft. Владелец профиля потом
переносит нужное в поле bio сам — черновик не трогает основной текст.
"""

import argparse
import logging

from app import payload_api
from app.llm.client import complete_json, load_prompt

logger = logging.getLogger(__name__)

ROLE_LABELS = {
    "faculty": "faculty member",
    "researcher": "researcher",
    "phd": "PhD student",
    "msc": "MSc student",
    "alumni": "alumnus/alumna",
}


def recent_titles(member_id: int, limit: int = 5) -> list[str]:
    docs = payload_api.find(
        "publications",
        where={"authors.member": {"equals": member_id}},
        limit=limit,
    )["docs"]
    docs.sort(key=lambda d: d.get("year") or 0, reverse=True)
    return [d["title"] for d in docs[:limit]]


def generate_bio(member: dict) -> str:
    titles = recent_titles(member["id"])
    data = complete_json(
        load_prompt(
            "bio",
            name=member.get("name") or "",
            role=ROLE_LABELS.get(member.get("role", ""), member.get("role", "")),
            interests=", ".join(member.get("researchInterests") or []) or "not specified",
            publications="; ".join(titles) or "none listed",
        )
    )
    return str(data.get("bio", "")).strip()


def run(limit: int | None = None, force: bool = False) -> None:
    members = payload_api.find_all("members")
    done = failed = skipped = 0
    for member in members:
        if member.get("bioAiDraft") and not force:
            skipped += 1
            continue
        if limit is not None and done >= limit:
            break
        try:
            bio = generate_bio(member)
            payload_api.update("members", member["id"], {"bioAiDraft": bio})
            done += 1
            logger.info("bio drafted: %s", member.get("name"))
        except Exception:
            failed += 1
            logger.exception("failed on member id=%s", member["id"])

    logger.info("done: %s drafted, %s skipped, %s failed", done, skipped, failed)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force", action="store_true", help="перегенерировать даже если черновик есть")
    args = parser.parse_args()
    run(args.limit, args.force)
