"""Единственное место в проекте, где вызывается LLM.

Требование ТЗ: «the code should be structured such that it should be relatively
straightforward to swap the underlying LLMs»; «all API calls should be
appropriately wrapped». Меняете LLM_MODEL в .env — меняется модель во всех
пайплайнах, код не трогается.
"""

import json
import logging
import re
from pathlib import Path

import litellm

from app.config import get_settings

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(name: str, **variables: str) -> str:
    """Читает промпт из prompts/<name>.md и подставляет {placeholders}."""
    template = (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")
    return template.format(**variables)


def complete(prompt: str, *, system: str | None = None) -> str:
    """Один вызов LLM. Модель, температура и лимит токенов — из конфига."""
    settings = get_settings()
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = litellm.completion(
        model=settings.llm_model,
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
            settings.llm_model,
            usage.prompt_tokens,
            usage.completion_tokens,
        )
    return content


def complete_json(prompt: str, *, system: str | None = None) -> dict:
    """Вызов LLM с ожиданием JSON-ответа. Терпимо относится к ```json-обёрткам."""
    raw = complete(prompt, system=system)
    text = raw.strip()
    # Модели любят заворачивать JSON в markdown-блок — снимаем
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as err:
        logger.error("LLM вернул не-JSON: %s", raw[:500])
        raise ValueError("LLM response is not valid JSON") from err
