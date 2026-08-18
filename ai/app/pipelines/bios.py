"""Bio drafts for group members.

Run:  python -m app.pipelines.bios [--limit N] [--force] [--extractive]

Two layers, the same shape the summarizer uses: a deterministic draft assembled
from the member's own record (extractive_bio), which an LLM then refines if one
is configured. Before that this needed a provider to produce anything, and with
none configured every draft on the site read "Member of the MLKD research group".

The draft lands in `bioAiDraft` and never touches `bio` — the profile owner moves
across what they want. That is also why --force is safe: the draft is scratch
space, the human's text is in the other field.
"""

import argparse
import logging

from app import payload_api
from app.llm.client import complete_json, load_prompt
from app.llm.errors import LLMOutputError
from app.llm.fallback import Answer, model_available, with_fallback
from app.pipelines.extractive_bio import extractive_bio, role_label

logger = logging.getLogger(__name__)

# How many of a person's publications to read. The bio quotes a count, a span and
# the newest title, so this has to cover their whole record rather than a page of
# it — for the one member with 230 papers, a lower cap would silently misreport
# both the count and the span.
PUBLICATION_CAP = 500


def member_publications(member_id: int, limit: int = PUBLICATION_CAP) -> list[dict]:
    docs = payload_api.find(
        "publications",
        where={"authors.member": {"equals": member_id}},
        limit=limit,
    )["docs"]
    return sorted(docs, key=lambda doc: doc.get("year") or 0, reverse=True)


def _llm_bio(member: dict, publications: list[dict], draft: str) -> str:
    data = complete_json(
        load_prompt(
            "bio",
            name=member.get("name") or "",
            role=role_label(member),
            interests=", ".join(member.get("researchInterests") or []) or "not specified",
            publications="; ".join(
                str(pub.get("title") or "") for pub in publications[:5] if pub.get("title")
            )
            or "none listed",
            draft=draft,
        )
    )
    text = str(data.get("bio", "")).strip()
    if not text:
        # Saving this would replace a true draft with nothing. Treated as bad
        # output so it degrades to the extractive text like any other failure.
        raise LLMOutputError(
            "The language model returned an empty bio.",
            "Check the bio prompt's output contract.",
        )
    return text


def generate_bio(member: dict) -> Answer:
    """A bio draft, and which layer produced it."""
    publications = member_publications(member["id"])
    return with_fallback(
        "bio",
        lambda: _llm_bio(member, publications, extractive_bio(member, publications)),
        lambda: extractive_bio(member, publications),
    )


def run(limit: int | None = None, force: bool = False, *, refine: bool = True) -> dict[str, int]:
    members = payload_api.find_all("members")
    counts = {"llm": 0, "extractive": 0, "skipped": 0, "failed": 0}

    # Asked once, not once per member: with no provider every attempt fails the
    # same way, and a run over the whole roster would spend its time waiting for
    # a hundred-odd identical failures before writing the same drafts anyway.
    if refine and not model_available():
        logger.info("no language model configured — drafting from the offline path only")
        refine = False

    for member in members:
        if member.get("bioAiDraft") and not force:
            counts["skipped"] += 1
            continue
        if limit is not None and counts["llm"] + counts["extractive"] >= limit:
            break
        try:
            if refine:
                answer = generate_bio(member)
            else:
                publications = member_publications(member["id"])
                answer = Answer(extractive_bio(member, publications), "extractive")
            payload_api.update("members", member["id"], {"bioAiDraft": answer.value})
            counts[answer.mode] += 1
            logger.info("bio drafted (%s): %s", answer.mode, member.get("name"))
        except Exception:
            counts["failed"] += 1
            logger.exception("failed on member id=%s", member["id"])

    logger.info(
        "done: %s refined by a model, %s from the offline draft, %s skipped, %s failed",
        counts["llm"],
        counts["extractive"],
        counts["skipped"],
        counts["failed"],
    )
    return counts


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force", action="store_true", help="regenerate even if a draft exists")
    parser.add_argument(
        "--extractive",
        action="store_true",
        help="skip the model entirely and write the deterministic draft",
    )
    args = parser.parse_args()
    run(args.limit, args.force, refine=not args.extractive)
