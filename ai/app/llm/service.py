from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any, Literal

import httpx
import litellm

from app.config import get_settings
from app.llm.errors import LLMError, map_provider_error

logger = logging.getLogger(__name__)

ProviderName = Literal["gemini", "openrouter", "ollama", "openai", "legacy"]


@dataclass
class ChatMessage:
    role: str
    content: str


@dataclass
class ProviderConfig:
    provider: ProviderName
    model: str
    litellm_model: str
    api_key: str = ""
    api_base: str = ""
    extra_headers: dict[str, str] | None = None


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    latency_ms: int
    request_id: str
    finish_reason: str | None = None
    usage: dict[str, int | None] | None = None
    raw_response: Any | None = None


class LLMService:
    def generate(
        self,
        messages: list[ChatMessage | dict[str, str]],
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        request_id: str | None = None,
        timeout: float | None = None,
    ) -> LLMResult:
        request_id = request_id or str(uuid.uuid4())
        errors: list[LLMError] = []
        for config in self._candidate_configs(model=model, request_id=request_id):
            try:
                return self._call_provider(
                    config,
                    messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    request_id=request_id,
                    timeout=timeout,
                )
            except LLMError as err:
                errors.append(err)
                logger.warning(
                    "llm call failed: request_id=%s provider=%s model=%s code=%s",
                    request_id,
                    err.provider,
                    err.model,
                    err.code,
                )
                if not get_settings().llm_fallback_enabled:
                    raise err
                continue

        if errors:
            raise errors[-1]
        raise LLMError(
            "LLM_NOT_CONFIGURED",
            "No language model provider is configured.",
            "Set GEMINI_API_KEY, OPENROUTER_API_KEY or OLLAMA_BASE_URL.",
            request_id,
        )

    def readiness(self) -> dict:
        request_id = str(uuid.uuid4())
        try:
            config = next(iter(self._candidate_configs(request_id=request_id, for_health=True)))
        except LLMError as err:
            return {"status": "not_configured", **err.to_response()}
        except StopIteration:
            err = LLMError(
                "LLM_NOT_CONFIGURED",
                "No language model provider is configured.",
                "Set LLM_PROVIDER and the corresponding provider credentials.",
                request_id,
            )
            return {"status": "not_configured", **err.to_response()}

        if config.provider == "ollama":
            try:
                models = httpx.get(f"{config.api_base.rstrip('/')}/api/tags", timeout=3.0).json().get("models", [])
                names = {item.get("name") for item in models}
                if config.model not in names:
                    err = LLMError(
                        "OLLAMA_MODEL_NOT_FOUND",
                        "The configured Ollama model is not available.",
                        f"Run: ollama pull {config.model}",
                        request_id,
                        config.provider,
                        config.model,
                    )
                    return {"status": "not_configured", **err.to_response()}
            except Exception:
                err = LLMError(
                    "OLLAMA_UNAVAILABLE",
                    "The local Ollama service is not running or cannot be reached.",
                    "Start Ollama or choose Gemini/OpenRouter.",
                    request_id,
                    config.provider,
                    config.model,
                )
                return {"status": "not_configured", **err.to_response()}

        return {
            "status": "ready",
            "provider": config.provider,
            "model": config.model,
            "credentialsConfigured": bool(config.api_key or config.provider == "ollama"),
        }

    def _call_provider(
        self,
        config: ProviderConfig,
        messages: list[ChatMessage | dict[str, str]],
        *,
        temperature: float | None,
        max_tokens: int | None,
        request_id: str,
        timeout: float | None,
    ) -> LLMResult:
        settings = get_settings()
        payload_messages = [
            msg if isinstance(msg, dict) else {"role": msg.role, "content": msg.content}
            for msg in messages
        ]
        kwargs: dict[str, Any] = {
            "model": config.litellm_model,
            "messages": payload_messages,
            "temperature": settings.llm_temperature if temperature is None else temperature,
            "max_tokens": settings.llm_max_tokens if max_tokens is None else max_tokens,
            "num_retries": settings.llm_max_retries,
            "timeout": settings.llm_timeout_seconds if timeout is None else timeout,
        }
        if config.api_key:
            kwargs["api_key"] = config.api_key
        if config.api_base:
            kwargs["api_base"] = config.api_base
        if config.extra_headers:
            kwargs["extra_headers"] = config.extra_headers

        start = time.monotonic()
        try:
            response = litellm.completion(**kwargs)
        except Exception as err:
            raise map_provider_error(err, provider=config.provider, model=config.model, request_id=request_id) from err

        latency_ms = int((time.monotonic() - start) * 1000)
        content = response.choices[0].message.content or ""
        if not content.strip():
            raise LLMError(
                "LLM_EMPTY_RESPONSE",
                "The language model returned an empty response.",
                "Try again or use another configured model.",
                request_id,
                config.provider,
                config.model,
            )
        usage = getattr(response, "usage", None)
        finish_reason = getattr(response.choices[0], "finish_reason", None)
        logger.info(
            "llm call: request_id=%s provider=%s model=%s latency_ms=%s status=ok",
            request_id,
            config.provider,
            config.model,
            latency_ms,
        )
        return LLMResult(
            text=content,
            provider=config.provider,
            model=config.model,
            latency_ms=latency_ms,
            request_id=request_id,
            finish_reason=finish_reason,
            usage=_usage_dict(usage),
            raw_response=response,
        )

    def _candidate_configs(
        self,
        *,
        model: str | None = None,
        request_id: str,
        for_health: bool = False,
    ) -> list[ProviderConfig]:
        settings = get_settings()
        override_model = _runtime_model_override()
        explicit_model = bool(model) or bool(override_model and "/" in override_model)
        runtime_model = model or override_model
        if explicit_model and runtime_model and "/" in runtime_model and not settings.llm_provider.strip():
            return [_legacy_config(runtime_model)]

        provider = settings.llm_provider.strip().lower() or "auto"
        if explicit_model and runtime_model and "/" in runtime_model and provider == "auto":
            return [_legacy_config(runtime_model)]

        order = _provider_order(provider, settings.llm_fallback_providers)
        configs: list[ProviderConfig] = []
        for item in order:
            try:
                config = _provider_config(item, runtime_model)
            except LLMError as err:
                err.request_id = err.request_id or request_id
                raise err
            if config:
                configs.append(config)
                if provider != "auto" and not settings.llm_fallback_enabled:
                    break
                if for_health:
                    break
        if not configs:
            raise LLMError(
                "LLM_NOT_CONFIGURED",
                "No language model provider is configured.",
                "Set GEMINI_API_KEY, OPENROUTER_API_KEY or OLLAMA_BASE_URL.",
                request_id,
            )
        return configs


def _runtime_model_override() -> str:
    try:
        from app.settings_cache import ai_settings

        data = ai_settings()
        custom_model = str(data.get("customModel") or "").strip()
        if custom_model:
            return custom_model
        dropdown_model = str(data.get("llmModel") or "").strip()
        return dropdown_model if dropdown_model and "/" not in dropdown_model else ""
    except Exception:
        return ""


def _provider_order(provider: str, fallback_providers: str) -> list[str]:
    if provider == "auto":
        providers = [item.strip().lower() for item in fallback_providers.split(",") if item.strip()]
        return providers or ["gemini", "openrouter", "ollama"]
    valid = {"gemini", "openrouter", "ollama", "openai"}
    if provider not in valid:
        return []
    providers = [provider]
    if get_settings().llm_fallback_enabled:
        for item in [p.strip().lower() for p in fallback_providers.split(",") if p.strip()]:
            if item in valid and item not in providers:
                providers.append(item)
    return providers


def _provider_config(provider: str, runtime_model: str) -> ProviderConfig | None:
    settings = get_settings()
    env_model = settings.llm_model.strip()
    selected = runtime_model or env_model
    if provider == "gemini":
        api_key = settings.gemini_api_key or settings.google_api_key
        if not api_key:
            return None
        model = selected or settings.gemini_model
        if not model:
            raise LLMError("MODEL_NOT_CONFIGURED", "No Gemini model is configured.", "Set GEMINI_MODEL or LLM_MODEL.")
        return ProviderConfig("gemini", _strip_prefix(model, "gemini/"), f"gemini/{_strip_prefix(model, 'gemini/')}", api_key=api_key)
    if provider == "openrouter":
        if not settings.openrouter_api_key:
            return None
        model = selected or settings.openrouter_model
        if not model:
            raise LLMError("MODEL_NOT_CONFIGURED", "No OpenRouter model is configured.", "Set OPENROUTER_MODEL or LLM_MODEL.")
        headers = {}
        if settings.openrouter_site_url:
            headers["HTTP-Referer"] = settings.openrouter_site_url
        if settings.openrouter_app_name:
            headers["X-Title"] = settings.openrouter_app_name
        return ProviderConfig("openrouter", model, f"openrouter/{model}", api_key=settings.openrouter_api_key, api_base=settings.openrouter_base_url, extra_headers=headers or None)
    if provider == "ollama":
        if not settings.ollama_base_url:
            return None
        model = selected or settings.ollama_model
        if not model:
            raise LLMError("MODEL_NOT_CONFIGURED", "No Ollama model is configured.", "Set OLLAMA_MODEL or LLM_MODEL.")
        return ProviderConfig("ollama", _strip_prefix(model, "ollama/"), f"ollama/{_strip_prefix(model, 'ollama/')}", api_base=settings.ollama_base_url)
    if provider == "openai":
        if not settings.openai_api_key:
            return None
        model = selected or settings.openai_model
        if not model:
            raise LLMError("MODEL_NOT_CONFIGURED", "No OpenAI model is configured.", "Set OPENAI_MODEL or LLM_MODEL.")
        return ProviderConfig("openai", model, model, api_key=settings.openai_api_key)
    return None


def _legacy_config(model: str) -> ProviderConfig:
    provider = model.split("/", 1)[0]
    return ProviderConfig("legacy", model, model)


def _strip_prefix(value: str, prefix: str) -> str:
    return value[len(prefix):] if value.startswith(prefix) else value


def _usage_dict(usage: Any) -> dict[str, int | None] | None:
    if not usage:
        return None
    return {
        "prompt": getattr(usage, "prompt_tokens", None),
        "completion": getattr(usage, "completion_tokens", None),
        "total": getattr(usage, "total_tokens", None),
    }


llm_service = LLMService()
