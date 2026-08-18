"""A provider that just refused for quota is not asked again straight away."""

import time
from unittest.mock import patch

import pytest

from app.llm import service as svc
from app.llm.errors import LLMError


def test_a_quota_refusal_puts_that_provider_aside_briefly():
    # The visitor's time was going into a first call we already knew would fail:
    # with a rate-limited free tier at the head of the chain, the median chat
    # answer took 35 seconds, nearly all of it there.
    svc._start_cooldown("openrouter")
    assert svc._is_cooling("openrouter") is True
    assert svc._is_cooling("ollama") is False


def test_the_cooldown_expires_on_its_own():
    svc._cooling["openrouter"] = time.monotonic() - 1
    assert svc._is_cooling("openrouter") is False
    assert "openrouter" not in svc._cooling


@pytest.mark.parametrize("code", ["PROVIDER_RATE_LIMITED", "PROVIDER_QUOTA_EXCEEDED"])
def test_only_quota_refusals_start_a_cooldown(code):
    assert code in svc._COOLDOWN_CODES


@pytest.mark.parametrize("code", ["LLM_TIMEOUT", "INVALID_API_KEY", "PROVIDER_UNAVAILABLE"])
def test_other_failures_do_not(code):
    # A timeout may be this one long prompt; a bad key is not fixed by waiting.
    # Neither is evidence the provider will refuse the next request too.
    assert code not in svc._COOLDOWN_CODES


def test_everything_cooling_reports_a_rate_limit_not_a_missing_key():
    # "Not configured" would send someone to check credentials that are fine.
    settings = svc.get_settings()
    with patch.object(svc, "_provider_order", return_value=["openrouter"]), patch.object(
        svc, "_provider_config", return_value=svc.ProviderConfig("openrouter", "m", "openrouter/m", api_key="k")
    ):
        svc._start_cooldown("openrouter")
        with pytest.raises(LLMError) as excinfo:
            svc.llm_service._candidate_configs(request_id="t")
    assert excinfo.value.code == "PROVIDER_RATE_LIMITED"
    assert settings is not None
