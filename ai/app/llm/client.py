"""Central LLM wrapper.

Changing the model should be a configuration change, not a code change. The
admin can override the model through the Payload ``ai-settings`` global; the AI
service falls back to ``LLM_MODEL`` when the CMS is unavailable.
"""

import json
import logging
import re
from pathlib import Path
from typing import Any

import litellm

from app.config import get_settings

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"

def resolve_model() -> str:
    """Runtime model: customModel > llmModel (ai-settings global) > LLM_MODEL env.

    The admin can switch the model without a redeploy. Reads the cached global;
    any failure falls back to env so the AI service never depends on the CMS.
    """
    from app.settings_cache import ai_settings

    data = ai_settings()
    model = (data.get("customModel") or data.get("llmModel") or "").strip()
    return model or get_settings().llm_model


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
):
    """Return the raw LiteLLM response for features that need usage metadata."""
    settings = get_settings()
    selected_model = model or resolve_model()
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    kwargs: dict[str, Any] = {
        "model": selected_model,
        "messages": messages,
        "temperature": settings.llm_temperature,
        "max_tokens": settings.llm_max_tokens,
        "num_retries": 2,
    }
    if timeout is not None:
        kwargs["timeout"] = timeout
    return litellm.completion(**kwargs)


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
) -> str:
    """Call the configured LLM and return message content."""
    selected_model = model or resolve_model()
    response = complete_response(prompt, system=system, model=selected_model, timeout=timeout)
    content = response.choices[0].message.content or ""
    usage = getattr(response, "usage", None)
    if usage:
        logger.info(
            "llm call: model=%s in=%s out=%s",
            selected_model,
            usage.prompt_tokens,
            usage.completion_tokens,
        )
    return content


def complete_json(
    prompt: str,
    *,
    system: str | None = None,
    model: str | None = None,
    timeout: float | None = None,
) -> dict:
    """Call the configured LLM and parse a JSON object."""
    return parse_json_response(complete(prompt, system=system, model=model, timeout=timeout))
