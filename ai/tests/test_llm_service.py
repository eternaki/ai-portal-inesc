import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.llm.errors import LLMError, redact_secret
from app.llm.service import ChatMessage, LLMService


def settings(**overrides):
    base = {
        "llm_provider": "auto",
        "llm_model": "",
        "llm_timeout_seconds": 60,
        "llm_max_retries": 1,
        "llm_temperature": 0.2,
        "llm_max_tokens": 1200,
        "llm_fallback_enabled": True,
        "llm_fallback_providers": "gemini,openrouter,ollama",
        "gemini_api_key": "",
        "google_api_key": "",
        "gemini_model": "gemini-3.5-flash-lite",
        "openrouter_api_key": "",
        "openrouter_base_url": "https://openrouter.ai/api/v1",
        "openrouter_model": "openrouter/free",
        "openrouter_site_url": "",
        "openrouter_app_name": "MLKD Intelligent Research Platform",
        "ollama_base_url": "http://localhost:11434",
        "ollama_model": "qwen3:8b",
        "openai_api_key": "",
        "openai_model": "",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def response(text="ok"):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text), finish_reason="stop")],
        usage=SimpleNamespace(prompt_tokens=1, completion_tokens=2, total_tokens=3),
    )


class LLMServiceTest(unittest.TestCase):
    def test_explicit_gemini_resolution(self):
        svc = LLMService()
        with (
            patch("app.llm.service.get_settings", return_value=settings(llm_provider="gemini", gemini_api_key="key")),
            patch("app.llm.service._runtime_model_override", return_value=""),
        ):
            config = svc._candidate_configs(request_id="test")[0]

        self.assertEqual(config.provider, "gemini")
        self.assertEqual(config.model, "gemini-3.5-flash-lite")
        self.assertEqual(config.litellm_model, "gemini/gemini-3.5-flash-lite")

    def test_explicit_openrouter_resolution(self):
        svc = LLMService()
        with (
            patch("app.llm.service.get_settings", return_value=settings(llm_provider="openrouter", openrouter_api_key="key")),
            patch("app.llm.service._runtime_model_override", return_value=""),
        ):
            config = svc._candidate_configs(request_id="test")[0]

        self.assertEqual(config.provider, "openrouter")
        self.assertEqual(config.model, "openrouter/free")
        self.assertEqual(config.litellm_model, "openrouter/openrouter/free")

    def test_explicit_ollama_resolution(self):
        svc = LLMService()
        with (
            patch("app.llm.service.get_settings", return_value=settings(llm_provider="ollama", ollama_model="qwen3:8b")),
            patch("app.llm.service._runtime_model_override", return_value=""),
        ):
            config = svc._candidate_configs(request_id="test")[0]

        self.assertEqual(config.provider, "ollama")
        self.assertEqual(config.model, "qwen3:8b")
        self.assertEqual(config.litellm_model, "ollama/qwen3:8b")

    def test_explicit_openai_resolution(self):
        svc = LLMService()
        with (
            patch(
                "app.llm.service.get_settings",
                return_value=settings(llm_provider="openai", openai_api_key="key", openai_model="gpt-4.1-mini"),
            ),
            patch("app.llm.service._runtime_model_override", return_value=""),
        ):
            config = svc._candidate_configs(request_id="test")[0]

        self.assertEqual(config.provider, "openai")
        self.assertEqual(config.model, "gpt-4.1-mini")
        self.assertEqual(config.litellm_model, "gpt-4.1-mini")

    def test_auto_mode_prefers_gemini_then_openrouter_then_ollama(self):
        svc = LLMService()
        with (
            patch(
                "app.llm.service.get_settings",
                return_value=settings(gemini_api_key="gemini-key", openrouter_api_key="or-key"),
            ),
            patch("app.llm.service._runtime_model_override", return_value=""),
        ):
            configs = svc._candidate_configs(request_id="test")

        self.assertEqual([item.provider for item in configs[:3]], ["gemini", "openrouter", "ollama"])

    def test_no_provider_configured(self):
        svc = LLMService()
        with (
            patch("app.llm.service.get_settings", return_value=settings(ollama_base_url="", ollama_model="")),
            patch("app.llm.service._runtime_model_override", return_value=""),
        ):
            with self.assertRaises(LLMError) as ctx:
                svc._candidate_configs(request_id="test")

        self.assertEqual(ctx.exception.code, "LLM_NOT_CONFIGURED")

    def test_fallback_disabled_by_default_setting(self):
        svc = LLMService()
        with (
            patch("app.llm.service.get_settings", return_value=settings(llm_provider="gemini", gemini_api_key="key", llm_fallback_enabled=False)),
            patch("app.llm.service._runtime_model_override", return_value=""),
            patch("app.llm.service.litellm.completion", side_effect=RuntimeError("rate limit")),
        ):
            with self.assertRaises(LLMError) as ctx:
                svc.generate([ChatMessage(role="user", content="hello")], request_id="test")

        self.assertEqual(ctx.exception.code, "PROVIDER_RATE_LIMITED")

    def test_fallback_order_when_enabled(self):
        svc = LLMService()
        with (
            patch(
                "app.llm.service.get_settings",
                return_value=settings(gemini_api_key="gemini-key", openrouter_api_key="or-key", llm_fallback_enabled=True),
            ),
            patch("app.llm.service._runtime_model_override", return_value=""),
            patch("app.llm.service.litellm.completion", side_effect=[RuntimeError("rate limit"), response("fallback ok")]) as completion,
        ):
            result = svc.generate([ChatMessage(role="user", content="hello")], request_id="test")

        self.assertEqual(result.provider, "openrouter")
        self.assertEqual(result.text, "fallback ok")
        self.assertEqual(completion.call_count, 2)

    def test_empty_response_maps_to_structured_error(self):
        svc = LLMService()
        with (
            patch("app.llm.service.get_settings", return_value=settings(llm_provider="gemini", gemini_api_key="key", llm_fallback_enabled=False)),
            patch("app.llm.service._runtime_model_override", return_value=""),
            patch("app.llm.service.litellm.completion", return_value=response("")),
        ):
            with self.assertRaises(LLMError) as ctx:
                svc.generate([ChatMessage(role="user", content="hello")], request_id="test")

        self.assertEqual(ctx.exception.code, "LLM_EMPTY_RESPONSE")

    def test_secret_redaction(self):
        self.assertNotIn("abc123", redact_secret("Bearer abc123"))
        self.assertIn("[redacted-secret]", redact_secret("Bearer abc123"))

    def test_health_response_without_billable_generation(self):
        svc = LLMService()
        with (
            patch("app.llm.service.get_settings", return_value=settings(gemini_api_key="key")),
            patch("app.llm.service._runtime_model_override", return_value=""),
            patch("app.llm.service.litellm.completion") as completion,
        ):
            health = svc.readiness()

        self.assertEqual(health["status"], "ready")
        self.assertEqual(health["provider"], "gemini")
        completion.assert_not_called()


if __name__ == "__main__":
    unittest.main()
