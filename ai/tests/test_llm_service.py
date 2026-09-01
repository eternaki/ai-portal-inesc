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
        "llm_fallback_providers": "gemini,openrouter",
        "gemini_api_key": "",
        "google_api_key": "",
        "gemini_model": "gemini-3.5-flash-lite",
        "openrouter_api_key": "",
        "openrouter_base_url": "https://openrouter.ai/api/v1",
        "openrouter_model": "google/gemma-4-26b-a4b-it:free",
        "openrouter_site_url": "",
        "openrouter_app_name": "MLKD Intelligent Research Platform",
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
        # The prefix is added exactly once. The old fixture was "openrouter/free",
        # which built "openrouter/openrouter/free" — a model id that resolves to
        # nothing, which is precisely why that placeholder failed as
        # MODEL_NOT_FOUND until someone replaced it with a real one.
        self.assertEqual(config.model, "google/gemma-4-26b-a4b-it:free")
        self.assertEqual(config.litellm_model, "openrouter/google/gemma-4-26b-a4b-it:free")

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

    def test_auto_mode_prefers_gemini_then_openrouter(self):
        svc = LLMService()
        with (
            patch(
                "app.llm.service.get_settings",
                return_value=settings(gemini_api_key="gemini-key", openrouter_api_key="or-key"),
            ),
            patch("app.llm.service._runtime_model_override", return_value=""),
        ):
            configs = svc._candidate_configs(request_id="test")

        self.assertEqual([item.provider for item in configs], ["gemini", "openrouter"])

    def test_no_provider_configured(self):
        svc = LLMService()
        with (
            patch("app.llm.service.get_settings", return_value=settings()),
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


class DefaultProviderChainTest(unittest.TestCase):
    """The shipped default, not a hand-built one — these guard a decision."""

    def test_the_default_chain_is_cloud_free_tiers_only(self):
        # A local model was tried here and removed outright: behind a request a
        # visitor waits on it has to beat the deterministic offline layer, and
        # measured on this project's questions it did not — asked in English about
        # 2024 it answered in Portuguese on eight runs out of eight, each after
        # ~30s. Adding a local provider back means re-arguing that, not tidying.
        #
        # Read off the field rather than Settings(): an instance picks up whoever's
        # .env is on the machine, and this asserts what the project ships.
        from app.config import Settings

        shipped = Settings.model_fields["llm_fallback_providers"].default
        self.assertEqual("gemini,openrouter", shipped)


class ChosenModelAppliesToTheChainTest(unittest.TestCase):
    """Picking a model in the admin must not cost the fallback chain."""

    def _configs(self, override, **over):
        svc = LLMService()
        base = dict(gemini_api_key="gemini-key", openrouter_api_key="or-key")
        base.update(over)
        with (
            patch("app.llm.service.get_settings", return_value=settings(**base)),
            patch("app.llm.service._runtime_model_override", return_value=override),
        ):
            return svc._candidate_configs(request_id="test")

    def test_a_prefixed_model_keeps_the_rest_of_the_chain_as_backup(self):
        # The regression: this used to return one config and drop the chain, so
        # choosing a model in the admin silently removed the fallback and the
        # quota cooldown with it.
        configs = self._configs("gemini/gemini-flash-latest")
        self.assertEqual(["gemini", "openrouter"], [c.provider for c in configs])

    def test_the_chosen_model_reaches_only_the_provider_it_names(self):
        # Handing "gemini/…" to openrouter would build "openrouter/gemini/…",
        # which resolves to nothing.
        configs = self._configs("gemini/gemini-flash-latest")
        by = {c.provider: c for c in configs}
        self.assertEqual("gemini/gemini-flash-latest", by["gemini"].litellm_model)
        self.assertNotIn("gemini", by["openrouter"].model)

    def test_an_openrouter_model_with_its_own_slash_survives_the_split(self):
        # "openrouter/google/gemma-…" — the provider is the first segment only.
        configs = self._configs("openrouter/google/gemma-4-26b-a4b-it:free")
        by = {c.provider: c for c in configs}
        self.assertEqual("openrouter/google/gemma-4-26b-a4b-it:free", by["openrouter"].litellm_model)

    def test_a_bare_model_still_applies_to_every_provider(self):
        # Unprefixed ids behave as LLM_MODEL always has.
        configs = self._configs("some-model")
        self.assertTrue(all(c.model == "some-model" for c in configs))

    def test_an_unimplemented_provider_stays_a_single_escape_hatch(self):
        # customModel is where someone reaches for a provider we do not build a
        # config for; that one goes to litellm alone rather than being ignored.
        configs = self._configs("anthropic/claude-x")
        self.assertEqual(1, len(configs))
        self.assertEqual("legacy", configs[0].provider)


if __name__ == "__main__":
    unittest.main()
