"""Батч-саммаризация публикаций (alphaxiv "Blog mode").

Запуск:  python -m app.pipelines.summarize [--limit N]

Берёт публикации с aiSummaryStatus=none и непустым abstract, генерирует саммари
и пишет обратно в Payload со статусом generated. Публикации со статусом edited
не трогаются никогда — ручная правка приоритетнее.
"""

import argparse
import logging

from app import payload_api
from app.llm.client import complete_json, load_prompt

logger = logging.getLogger(__name__)

SUMMARY_KEYS = ("tldr", "problem", "method", "results", "takeaways")


def summarize_publication(pub: dict) -> dict:
    prompt = load_prompt(
        "summary",
        title=pub.get("title") or "",
        venue=pub.get("venue") or "unknown venue",
        year=str(pub.get("year") or ""),
        abstract=pub.get("abstract") or "",
    )
    data = complete_json(prompt)
    return {key: str(data.get(key, "")).strip() for key in SUMMARY_KEYS}


def run(limit: int | None = None) -> None:
    result = payload_api.find(
        "publications",
        where={
            "and": [
                {"aiSummaryStatus": {"equals": "none"}},
                {"abstract": {"exists": True}},
            ]
        },
        limit=limit or 100,
    )
    pubs = result["docs"]
    logger.info("publications to summarize: %s", len(pubs))

    done = failed = 0
    for pub in pubs:
        if not (pub.get("abstract") or "").strip():
            continue
        try:
            summary = summarize_publication(pub)
            payload_api.update(
                "publications",
                pub["id"],
                {"aiSummary": summary, "aiSummaryStatus": "generated"},
            )
            done += 1
            logger.info("summarized: %s", pub["title"][:80])
        except Exception:
            failed += 1
            logger.exception("failed on publication id=%s", pub["id"])

    logger.info("done: %s summarized, %s failed", done, failed)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    run(args.limit)
