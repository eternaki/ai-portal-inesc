"""The one mechanism every AI feature degrades through.

What it declines to catch is the interesting half: a bug in this repository must
not disguise itself as a missing provider, or the fix looks like "add an API key"
and never arrives.
"""

from unittest.mock import patch

import pytest

from app.llm.errors import LLMError, LLMOutputError
from app.llm.fallback import MODE_EXTRACTIVE, MODE_LLM, model_available, with_fallback


def test_a_working_model_is_used_and_the_fallback_never_runs():
    def fallback():
        raise AssertionError("the offline path ran while the model was answering")

    answer = with_fallback("test", lambda: "from the model", fallback)
    assert answer.value == "from the model"
    assert answer.mode == MODE_LLM
    assert answer.degraded is False
    assert answer.reason is None


def test_a_provider_failure_degrades_and_records_why():
    answer = with_fallback(
        "test",
        lambda: (_ for _ in ()).throw(LLMError("PROVIDER_QUOTA_EXCEEDED", "out of quota")),
        lambda: "offline",
    )
    assert answer.value == "offline"
    assert answer.mode == MODE_EXTRACTIVE
    assert answer.degraded is True
    assert answer.reason == "PROVIDER_QUOTA_EXCEEDED"


def test_unusable_output_degrades_like_a_dead_provider():
    # A model that answers with prose where JSON was required has not answered.
    answer = with_fallback(
        "test",
        lambda: (_ for _ in ()).throw(LLMOutputError("not JSON")),
        lambda: "offline",
    )
    assert answer.mode == MODE_EXTRACTIVE
    assert answer.reason == "LLM_BAD_OUTPUT"


def test_a_bug_in_our_own_code_is_not_swallowed():
    # The failure this guards: a prompt gains a {placeholder} nobody passes, and
    # load_prompt raises KeyError. Caught here, every answer would silently come
    # from the offline path forever, looking exactly like "no provider set up" —
    # and adding credentials would not fix it.
    with pytest.raises(KeyError):
        with_fallback("test", lambda: (_ for _ in ()).throw(KeyError("draft")), lambda: "offline")


def test_the_degradation_is_counted_so_it_is_visible_in_metrics():
    with patch("app.metrics.record_degradation") as recorded:
        with_fallback("chat", lambda: (_ for _ in ()).throw(LLMError("LLM_TIMEOUT", "slow")), lambda: "x")
    recorded.assert_called_once()
    surface, reason, _ms = recorded.call_args.args
    assert (surface, reason) == ("chat", "LLM_TIMEOUT")


def test_nothing_is_counted_when_the_model_answers():
    with patch("app.metrics.record_degradation") as recorded:
        with_fallback("chat", lambda: "fine", lambda: "x")
    recorded.assert_not_called()


def test_the_fallback_is_deferred_until_it_is_needed():
    # It is a thunk, not a value: for most surfaces it does real work — reading an
    # abstract, gathering someone's publications — that is wasted on every call
    # the model answers.
    ran = []
    with_fallback("test", lambda: "ok", lambda: ran.append(1))
    assert ran == []


# --- batch jobs ask once ---------------------------------------------------


def test_model_available_reports_a_configured_provider():
    with patch("app.llm.service.llm_service.readiness", return_value={"status": "ready"}):
        assert model_available() is True
    with patch("app.llm.service.llm_service.readiness", return_value={"status": "not_configured"}):
        assert model_available() is False


def test_a_broken_readiness_probe_does_not_stop_a_batch_job():
    # Answering "no model" is always safe here — the offline path runs. Raising
    # would abort a drafting run over the whole roster.
    with patch("app.llm.service.llm_service.readiness", side_effect=RuntimeError("boom")):
        assert model_available() is False
