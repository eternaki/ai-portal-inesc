"""The only place in the project where an LLM is called.

Brief requirement: "the code should be structured such that it should be
relatively straightforward to swap the underlying LLMs"; "all API calls should
be appropriately wrapped". Change LLM_MODEL in .env and the model changes across
every pipeline — no code is touched.
"""

import json
import logging
import re
from pathlib import Path

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
    """Read the prompt from prompts/<prompt_name>.md and fill in {placeholders}.

    The name is positional-only (/) so it does not clash with a `name` variable
    used inside prompts (e.g. bio.md uses {name}).
    """
    template = (PROMPTS_DIR / f"{prompt_name}.md").read_text(encoding="utf-8")
    return template.format(**variables)


def complete(prompt: str, *, system: str | None = None) -> str:
    """A single LLM call. Model, temperature and token limit come from config."""
    settings = get_settings()
    model = resolve_model()
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = litellm.completion(
        model=model,
        messages=messages,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        num_retries=2,
    )
    content = response.choices[0].message.content or ""
    usage = getattr(response, "usage", None)
    if usage:
        logger.info(
            "llm call: model=%s in=%s out=%s",
            model,
            usage.prompt_tokens,
            usage.completion_tokens,
        )
    return content


def complete_json(prompt: str, *, system: str | None = None) -> dict:
    """An LLM call expecting a JSON response. Tolerates ```json fences."""
    raw = complete(prompt, system=system)
    text = raw.strip()
    # Models like to wrap JSON in a markdown block — strip it
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as err:
        logger.error("LLM returned non-JSON: %s", raw[:500])
        raise ValueError("LLM response is not valid JSON") from err
