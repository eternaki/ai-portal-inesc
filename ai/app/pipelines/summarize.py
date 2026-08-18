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
from app.llm.fallback import model_available, with_fallback
from app.pipelines.extractive import EXTRACTIVE_MODEL, EXTRACTIVE_VERSION, extractive_summary

logger = logging.getLogger(__name__)

# Pause between LLM calls to avoid hitting free-tier rate limits.
# Configurable via SUMMARIZE_DELAY_SEC (default 4s ≈ 15 requests/min).
_DELAY = float(os.environ.get("SUMMARIZE_DELAY_SEC", "4"))
PROMPT_VERSION = "summary-refine-v1"
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


def summarize_publication_result(pub: dict, *, refine: bool = True) -> dict:
    """Hybrid summary: a deterministic extractive draft, optionally LLM-refined.

    The extractive layer (extractive.py) always produces a full draft from the
    abstract/metadata alone — no API key, no quota. When refine=True and an LLM is
    reachable, the model only rewrites that draft into cleaner prose; if the model
    is unconfigured or fails, we keep the draft. So summaries never hard-depend on
    a paid or rate-limited provider — the whole point of this pipeline.
    """
    draft = extractive_summary(pub)
    generated_at = datetime.now(timezone.utc).isoformat()

    if not refine:
        return _result(draft, EXTRACTIVE_MODEL, EXTRACTIVE_VERSION, generated_at)

    answer = with_fallback(
        "summary",
        lambda: _llm_refine(pub, draft),
        lambda: {"summary": draft, "model": EXTRACTIVE_MODEL},
    )
    if answer.degraded:
        return _result(draft, EXTRACTIVE_MODEL, EXTRACTIVE_VERSION, generated_at)
    return _result(answer.value["summary"], answer.value["model"], PROMPT_VERSION, generated_at)


def _result(summary: dict, model: str, version: str, generated_at: str) -> dict:
    return {
        "aiSummary": normalize_summary(summary),
        "aiSummaryModel": model,
        "aiSummaryPromptVersion": version,
        "aiSummaryGeneratedAt": generated_at,
    }


def _llm_refine(pub: dict, draft: dict[str, str]) -> dict:
    """Ask the LLM to polish the extractive draft. Raises if no model is available."""
    import json

    prompt = load_prompt(
        "summary_refine",
        title=pub.get("title") or "",
        venue=pub.get("venue") or "unknown venue",
        year=str(pub.get("year") or ""),
        abstract=pub.get("abstract") or "",
        draft=json.dumps(draft, ensure_ascii=False),
    )
    model = resolve_model()
    response = complete_response(prompt, model=model)
    raw = response.choices[0].message.content or ""
    return {"summary": parse_json_response(raw), "model": model}


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


def run(limit: int | None = None, *, refine: bool = True) -> None:
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
    # Asked once, not once per paper: with no provider every refine attempt fails
    # identically, and the run would wait out a hundred of them to write the same
    # drafts. Also skips the per-call delay below, which exists to pace a provider.
    if refine and not model_available():
        logger.info("no language model configured — writing extractive drafts only")
        refine = False
    logger.info("publications to summarize: %s (refine=%s)", len(pubs), refine)

    done = failed = 0
    for pub in pubs:
        if not (pub.get("abstract") or "").strip():
            continue
        try:
            update_data = summarize_publication_result(pub, refine=refine)
            payload_api.update(
                "publications",
                pub["id"],
                {**update_data, "aiSummaryStatus": "generated"},
            )
            done += 1
            logger.info("summarized: %s", pub["title"][:80])
            # Only pace the loop when we actually called the LLM — the extractive
            # path is local and free, so it doesn't need rate-limiting.
            if update_data["aiSummaryModel"] != EXTRACTIVE_MODEL:
                time.sleep(_DELAY)
        except Exception:
            failed += 1
            logger.exception("failed on publication id=%s", pub["id"])

    logger.info("done: %s summarized, %s failed", done, failed)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument(
        "--extractive",
        action="store_true",
        help="Skip the LLM refine step — deterministic summaries only (no key/quota).",
    )
    args = parser.parse_args()
    run(args.limit, refine=not args.extractive)
