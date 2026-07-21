"""Batch summarization of publications (alphaxiv "Blog mode").

Run:  python -m app.pipelines.summarize [--limit N]

Takes publications with aiSummaryStatus=none and a non-empty abstract, generates
a summary and writes it back to Payload with status generated. Publications with
status edited are never touched — manual edits take priority.
"""

import argparse
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

from app import payload_api
from app.llm.client import complete_response, load_prompt, parse_json_response, resolve_model

logger = logging.getLogger(__name__)

# Pause between LLM calls to avoid hitting free-tier rate limits.
# Configurable via SUMMARIZE_DELAY_SEC (default 4s ≈ 15 requests/min).
_DELAY = float(os.environ.get("SUMMARIZE_DELAY_SEC", "4"))
PROMPT_VERSION = "summary-v2"
_NOT_SPECIFIED = "Not specified in the abstract."

SUMMARY_KEYS = (
    "tldr",
    "problem",
    "method",
    "results",
    "contributions",
    "limitations",
    "takeaways",
    "applications",
    "topics",
    "industry",
    "impact",
)


def summarize_publication(pub: dict) -> dict:
    result = summarize_publication_result(pub)
    return result["aiSummary"]


def summarize_publication_result(pub: dict) -> dict:
    prompt = load_prompt(
        "summary",
        title=pub.get("title") or "",
        venue=pub.get("venue") or "unknown venue",
        year=str(pub.get("year") or ""),
        abstract=pub.get("abstract") or "",
    )
    model = resolve_model()
    response = complete_response(prompt, model=model)
    raw = response.choices[0].message.content or ""
    data = parse_json_response(raw)
    return {
        "aiSummary": normalize_summary(data),
        "aiSummaryModel": model,
        "aiSummaryPromptVersion": PROMPT_VERSION,
        "aiSummaryGeneratedAt": datetime.now(timezone.utc).isoformat(),
    }


def normalize_summary(data: dict[str, Any]) -> dict[str, str]:
    summary: dict[str, str] = {}
    for key in SUMMARY_KEYS:
        value = data.get(key)
        if isinstance(value, list):
            text = "; ".join(str(item).strip() for item in value if str(item).strip())
        else:
            text = str(value or "").strip()
        summary[key] = text or _NOT_SPECIFIED
    return summary


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
            update_data = summarize_publication_result(pub)
            payload_api.update(
                "publications",
                pub["id"],
                {**update_data, "aiSummaryStatus": "generated"},
            )
            done += 1
            logger.info("summarized: %s", pub["title"][:80])
        except Exception:
            failed += 1
            logger.exception("failed on publication id=%s", pub["id"])
        time.sleep(_DELAY)

    logger.info("done: %s summarized, %s failed", done, failed)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    run(args.limit)
