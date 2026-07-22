from __future__ import annotations

import re
from dataclasses import dataclass


ERROR_STATUS = {
    "LLM_NOT_CONFIGURED": 503,
    "MODEL_NOT_CONFIGURED": 503,
    "INVALID_API_KEY": 502,
    "MODEL_NOT_FOUND": 502,
    "PROVIDER_UNAVAILABLE": 503,
    "PROVIDER_RATE_LIMITED": 429,
    "PROVIDER_QUOTA_EXCEEDED": 429,
    "LLM_TIMEOUT": 504,
    "OLLAMA_UNAVAILABLE": 503,
    "OLLAMA_MODEL_NOT_FOUND": 503,
    "LLM_EMPTY_RESPONSE": 502,
    "LLM_INTERNAL_ERROR": 500,
}


@dataclass
class LLMError(Exception):
    code: str
    message: str
    hint: str = ""
    request_id: str | None = None
    provider: str | None = None
    model: str | None = None

    @property
    def http_status(self) -> int:
        return ERROR_STATUS.get(self.code, 500)

    def to_response(self) -> dict:
        error = {
            "code": self.code,
            "message": self.message,
            "hint": self.hint,
            "requestId": self.request_id,
        }
        if self.provider:
            error["provider"] = self.provider
        if self.model:
            error["model"] = self.model
        return {"error": error}


def redact_secret(value: str) -> str:
    text = str(value)
    patterns = [
        r"Bearer\s+[A-Za-z0-9._\-]+",
        r"sk-or-[A-Za-z0-9._\-]+",
        r"sk-[A-Za-z0-9._\-]+",
        r"AIza[A-Za-z0-9._\-]+",
    ]
    for pattern in patterns:
        text = re.sub(pattern, "[redacted-secret]", text)
    return text


def map_provider_error(err: Exception, *, provider: str, model: str, request_id: str) -> LLMError:
    name = err.__class__.__name__.lower()
    message = redact_secret(str(err)).lower()

    if "timeout" in name or "timeout" in message:
        return LLMError("LLM_TIMEOUT", "The language-model request timed out.", "Try again or use a faster model.", request_id, provider, model)
    if "authentication" in name or "permission" in name or "unauthorized" in message or "invalid api key" in message:
        return LLMError("INVALID_API_KEY", "The configured language-model credential was rejected.", "Check the provider API key in the server environment.", request_id, provider, model)
    if "rate" in name or "rate limit" in message or "too many requests" in message:
        return LLMError("PROVIDER_RATE_LIMITED", "The language-model provider is temporarily rate-limited.", "Wait and try again later.", request_id, provider, model)
    if "quota" in message or "resource_exhausted" in message or "insufficient credits" in message:
        return LLMError("PROVIDER_QUOTA_EXCEEDED", "The language-model provider quota was exceeded.", "Use another configured provider or wait for quota reset.", request_id, provider, model)
    if "notfound" in name or "not found" in message or "model_not_found" in message:
        code = "OLLAMA_MODEL_NOT_FOUND" if provider == "ollama" else "MODEL_NOT_FOUND"
        return LLMError(code, "The configured model is unavailable.", "Check the configured model name.", request_id, provider, model)
    if provider == "ollama" and ("connection" in name or "connect" in message or "refused" in message):
        return LLMError("OLLAMA_UNAVAILABLE", "The local Ollama service is not running or cannot be reached.", "Start Ollama or choose a cloud provider.", request_id, provider, model)
    if "connection" in name or "serviceunavailable" in name or "unavailable" in message:
        return LLMError("PROVIDER_UNAVAILABLE", "The language-model provider is unavailable.", "Try again later or use a fallback provider.", request_id, provider, model)

    return LLMError("LLM_INTERNAL_ERROR", "The language-model request failed.", "Check server logs for the mapped provider error.", request_id, provider, model)
