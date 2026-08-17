"""Central LLM wrapper.

Changing the model should be a configuration change, not a code change. The
admin can override the model through the Payload ``ai-settings`` global; the AI
service falls back to ``LLM_MODEL`` when the CMS is unavailable.
"""

import json
import logging
import re
from pathlib import Path

from app.llm.errors import LLMOutputError
from app.llm.service import ChatMessage, llm_service

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"

def resolve_model() -> str:
    """Runtime model resolved through the central LLM service.

    Kept for backward compatibility with callers that only need metadata.
    """
    config = llm_service._candidate_configs(request_id="metadata")[0]
    return config.litellm_model


def load_prompt(prompt_name: str, /, **variables: str) -> str:
    """Read prompts/<prompt_name>.md and fill placeholders."""
    template = (PROMPTS_DIR / f"{prompt_name}.md").read_text(encoding="utf-8")
    return template.format(**variables)


def complete_response(
    prompt: str,
    *,
    system: str | None = None,
    model: str | None = None,
    timeout: float | None = None,
    request_id: str | None = None,
):
    """Return the raw LiteLLM response for features that need usage metadata."""
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return llm_service.generate(messages, model=model, timeout=timeout, request_id=request_id).raw_response


def parse_json_response(raw: str) -> dict:
    """Parse JSON returned by an LLM, tolerating markdown fences.

    Raises LLMOutputError, which is an LLMError: to a caller deciding whether to
    fall back, a model that answers in prose where JSON was required is the same
    event as a model that does not answer at all, and both must take the offline
    path rather than one degrading and the other raising a 500.
    """
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as err:
        logger.error("LLM returned non-JSON: %s", raw[:500])
        raise LLMOutputError(
            "The language model did not return valid JSON.",
            "Check the prompt's output contract, or try another model.",
        ) from err
    if not isinstance(parsed, dict):
        # A bare list or string parses cleanly and then fails later, at a
        # .get() far from here with nothing pointing back at the model.
        raise LLMOutputError(
            f"The language model returned {type(parsed).__name__}, not a JSON object.",
            "Check the prompt's output contract, or try another model.",
        )
    return parsed


def complete(
    prompt: str,
    *,
    system: str | None = None,
    model: str | None = None,
    timeout: float | None = None,
    request_id: str | None = None,
) -> str:
    """Call the configured LLM and return message content."""
    messages: list[ChatMessage] = []
    if system:
        messages.append(ChatMessage(role="system", content=system))
    messages.append(ChatMessage(role="user", content=prompt))
    return llm_service.generate(messages, model=model, timeout=timeout, request_id=request_id).text


def complete_json(
    prompt: str,
    *,
    system: str | None = None,
    model: str | None = None,
    timeout: float | None = None,
    request_id: str | None = None,
) -> dict:
    """Call the configured LLM and parse a JSON object."""
    return parse_json_response(complete(prompt, system=system, model=model, timeout=timeout, request_id=request_id))
