from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any, Literal

import httpx
import litellm

from app import metrics
from app.config import get_settings
from app.llm.errors import LLMError, map_provider_error

logger = logging.getLogger(__name__)

ProviderName = Literal["gemini", "openrouter", "openai", "legacy"]

# Providers this service knows how to build a config for. A model naming anything
# else is passed through to litellm untouched rather than silently ignored.
_KNOWN_PROVIDERS = {"gemini", "openrouter", "openai"}

# A provider that just refused for quota will refuse again seconds later, so
# trying it on the next request spends the visitor's time to learn what we already
# know: with a rate-limited free tier at the head of the chain, the median chat
# answer took 35 seconds, nearly all of it in a doomed first call.
#
# Short on purpose. A free tier's window is usually a minute or less, and the cost
# of guessing wrong is one degraded answer, not an outage.
_COOLDOWN_SECONDS = 45.0
_COOLDOWN_CODES = {"PROVIDER_RATE_LIMITED", "PROVIDER_QUOTA_EXCEEDED"}
_cooling: dict[str, float] = {}


def _is_cooling(provider: str) -> bool:
    until = _cooling.get(provider)
    if until is None:
        return False
    if time.monotonic() >= until:
        del _cooling[provider]
        return False
    return True


def _start_cooldown(provider: str) -> None:
    _cooling[provider] = time.monotonic() + _COOLDOWN_SECONDS


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
                if err.code in _COOLDOWN_CODES:
                    _start_cooldown(config.provider)
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
            "Set GEMINI_API_KEY or OPENROUTER_API_KEY.",
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

        return {
            "status": "ready",
            "provider": config.provider,
            "model": config.model,
            "credentialsConfigured": bool(config.api_key),
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
            metrics.record_llm(config.provider, config.model, "error", (time.monotonic() - start) * 1000)
            raise map_provider_error(err, provider=config.provider, model=config.model, request_id=request_id) from err

        latency_ms = int((time.monotonic() - start) * 1000)
        usage_obj = getattr(response, "usage", None)
        metrics.record_llm(
            config.provider,
            config.model,
            "ok",
            latency_ms,
            cost_usd=_response_cost(response),
            total_tokens=int(getattr(usage_obj, "total_tokens", 0) or 0),
        )
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
        runtime_model = model or _runtime_model_override()
        provider = settings.llm_provider.strip().lower() or "auto"

        # A chosen model names a provider ("gemini/gemini-flash-latest"). It used
        # to short-circuit to that one provider and discard the chain — losing the
        # fallback and the quota cooldown with it, so picking a model in the admin
        # quietly made the service less reliable. Now it selects the model *for
        # that provider*; the others keep their own defaults and stay as backup.
        # Only a prefixed model names a provider. A bare one ("gpt-4.1-mini")
        # applies to every provider in the chain, as an env-set LLM_MODEL always has.
        hinted_provider = runtime_model.split("/", 1)[0].lower() if "/" in (runtime_model or "") else ""
        if hinted_provider and hinted_provider not in _KNOWN_PROVIDERS:
            # A provider we do not implement — the escape hatch stays an escape
            # hatch: hand it to litellm as-is and let it succeed or fail alone.
            return [_legacy_config(runtime_model)]

        order = _provider_order(provider, settings.llm_fallback_providers)
        configs: list[ProviderConfig] = []
        cooling: list[str] = []
        for item in order:
            try:
                # Prefixed model → only the provider it names. Handing
                # "gemini/…" to openrouter would build "openrouter/gemini/…".
                for_item = runtime_model if not hinted_provider or hinted_provider == item else ""
                config = _provider_config(item, for_item)
            except LLMError as err:
                err.request_id = err.request_id or request_id
                raise err
            if config:
                # Skip a provider still cooling off after a quota refusal: asking
                # again costs the visitor a full wait to be told what we know.
                if _is_cooling(config.provider) and not for_health:
                    cooling.append(config.provider)
                    continue
                configs.append(config)
                if provider != "auto" and not settings.llm_fallback_enabled:
                    break
                if for_health:
                    break
        if not configs:
            if cooling:
                # Configured, just refusing. "Not configured" would send someone
                # to check credentials that are perfectly fine.
                raise LLMError(
                    "PROVIDER_RATE_LIMITED",
                    "Every configured provider is rate-limited right now.",
                    f"Cooling off: {', '.join(cooling)}. Retried automatically within a minute.",
                    request_id,
                )
            raise LLMError(
                "LLM_NOT_CONFIGURED",
                "No language model provider is configured.",
                "Set GEMINI_API_KEY or OPENROUTER_API_KEY.",
                request_id,
            )
        return configs


def _runtime_model_override() -> str:
    """The model an editor picked in the admin, or "" if they picked none.

    Values that name a provider ("gemini/gemini-flash-latest") used to be dropped
    here — the filter kept only bare model ids, and every option in the dropdown
    carries a prefix, so the control did nothing at all. Selecting a model in the
    admin changed no behaviour whatsoever.
    """
    try:
        from app.settings_cache import ai_settings

        data = ai_settings()
        custom_model = str(data.get("customModel") or "").strip()
        if custom_model:
            return custom_model
        return str(data.get("llmModel") or "").strip()
    except Exception:
        return ""


def _provider_order(provider: str, fallback_providers: str) -> list[str]:
    if provider == "auto":
        providers = [item.strip().lower() for item in fallback_providers.split(",") if item.strip()]
        return providers or ["gemini", "openrouter"]
    valid = {"gemini", "openrouter", "openai"}
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
        # Strip our own prefix before adding it back: an admin-chosen id arrives
        # as "openrouter/google/gemma-…", and OpenRouter model ids contain a slash
        # of their own, so a naive concat yields "openrouter/openrouter/google/…".
        model = _strip_prefix(selected or settings.openrouter_model, "openrouter/")
        if not model:
            raise LLMError("MODEL_NOT_CONFIGURED", "No OpenRouter model is configured.", "Set OPENROUTER_MODEL or LLM_MODEL.")
        headers = {}
        if settings.openrouter_site_url:
            headers["HTTP-Referer"] = settings.openrouter_site_url
        if settings.openrouter_app_name:
            headers["X-Title"] = settings.openrouter_app_name
        return ProviderConfig("openrouter", model, f"openrouter/{model}", api_key=settings.openrouter_api_key, api_base=settings.openrouter_base_url, extra_headers=headers or None)
    if provider == "openai":
        if not settings.openai_api_key:
            return None
        # litellm takes OpenAI ids bare, so the prefix is stripped and not re-added.
        model = _strip_prefix(selected or settings.openai_model, "openai/")
        if not model:
            raise LLMError("MODEL_NOT_CONFIGURED", "No OpenAI model is configured.", "Set OPENAI_MODEL or LLM_MODEL.")
        return ProviderConfig("openai", model, model, api_key=settings.openai_api_key)
    return None


def _legacy_config(model: str) -> ProviderConfig:
    provider = model.split("/", 1)[0]
    return ProviderConfig("legacy", model, model)


def _strip_prefix(value: str, prefix: str) -> str:
    return value[len(prefix):] if value.startswith(prefix) else value


def _response_cost(response: Any) -> float:
    """Best-effort USD cost of a completion for cost monitoring.

    litellm knows per-model pricing; if the model is unknown or pricing is missing
    it raises, so we swallow and report 0 rather than fail the call.
    """
    try:
        return float(litellm.completion_cost(completion_response=response) or 0.0)
    except Exception:  # noqa: BLE001 - cost is a metric, never a hard dependency
        return 0.0


def _usage_dict(usage: Any) -> dict[str, int | None] | None:
    if not usage:
        return None
    return {
        "prompt": getattr(usage, "prompt_tokens", None),
        "completion": getattr(usage, "completion_tokens", None),
        "total": getattr(usage, "total_tokens", None),
    }


llm_service = LLMService()
