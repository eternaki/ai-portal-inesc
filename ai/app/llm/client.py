"""Central LLM wrapper.

Changing the model should be a configuration change, not a code change. The
admin can override the model through the Payload ``ai-settings`` global; the AI
service falls back to ``LLM_MODEL`` when the CMS is unavailable.
"""

import json
import logging
import re
from pathlib import Path

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
    """Parse JSON returned by an LLM, tolerating markdown fences."""
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as err:
        logger.error("LLM returned non-JSON: %s", raw[:500])
        raise ValueError("LLM response is not valid JSON") from err


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
