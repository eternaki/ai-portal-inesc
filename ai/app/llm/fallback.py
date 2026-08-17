"""Running an LLM call the site is able to do without.

The architecture rule is that the LLM is offline, not a runtime dependency: the
site works with the provider down. That was true of summaries and of the chat,
each having grown its own `try/except` around its own call, and simply not true
of bios, snippets and the admin RAG, which raised. Three surfaces disagreeing
about a rule stated in CLAUDE.md is what a missing mechanism looks like.

This is that mechanism. A feature says what it would like the model to do and
what it will produce without one, and gets back both the value and which layer
produced it — so the caller can label it, log it, and count it, rather than
quietly serving a lesser answer as though nothing happened.

What is deliberately *not* caught matters as much as what is. A provider failure
degrades; so does output that breaks the contract, because a model returning
prose where JSON was required is as unusable as no model at all. A KeyError from
a prompt placeholder does not: that is a bug in this repository, and swallowing
it would show up as a permanent, silent "no model configured" that no amount of
adding credentials would fix.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable

from app import metrics
from app.llm.errors import LLMError

logger = logging.getLogger(__name__)

# How an answer was produced. Shared with the HTTP layer so /chat's `mode` field
# and a pipeline's provenance stamp mean the same thing.
MODE_LLM = "llm"
MODE_EXTRACTIVE = "extractive"


def model_available() -> bool:
    """Whether any provider is configured at all.

    For batch pipelines to ask *once*, before looping. Without a provider every
    call in the run fails identically — a drafting run over 114 members made 114
    doomed attempts. Harmless against a refused connection, hours of dead waiting
    against a provider that times out instead.

    Deliberately not consulted by `with_fallback` itself: per request, one extra
    check on the happy path buys nothing, and a provider can come back between
    two calls. This answers "is it worth trying at all", not "will this succeed".
    """
    from app.llm.service import llm_service

    try:
        return llm_service.readiness().get("status") == "ready"
    except Exception:  # noqa: BLE001 - a readiness probe must not stop a batch job
        logger.warning("could not determine model availability; assuming none", exc_info=True)
        return False


@dataclass(frozen=True)
class Answer:
    """A result, plus an honest record of where it came from."""

    value: Any
    mode: str
    reason: str | None = None

    @property
    def degraded(self) -> bool:
        return self.mode != MODE_LLM


def with_fallback(
    surface: str,
    call: Callable[[], Any],
    fallback: Callable[[], Any],
    *,
    request_id: str | None = None,
) -> Answer:
    """Run `call`; on any model failure run `fallback` instead.

    `surface` names the feature ("chat", "bio", "snippet") and appears in the log
    line and the metric, so a provider that starts failing shows up as *which*
    features degraded rather than as an anonymous error count.

    `fallback` is a thunk, not a value: for most surfaces it does real work
    (reading the abstract, assembling from publications) that is wasted whenever
    the model does answer.
    """
    started = time.monotonic()
    try:
        return Answer(call(), MODE_LLM)
    except LLMError as err:
        reason = err.code
        if request_id and not err.request_id:
            err.request_id = request_id
        logger.warning(
            "%s degraded to the offline path: code=%s provider=%s request_id=%s",
            surface,
            err.code,
            err.provider,
            err.request_id or request_id,
        )

    metrics.record_degradation(surface, reason, (time.monotonic() - started) * 1000)
    return Answer(fallback(), MODE_EXTRACTIVE, reason)
