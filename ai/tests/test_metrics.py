"""Unit tests for the in-process metrics registry (pure, no DB/LLM needed)."""

from app import metrics


def setup_function():
    metrics.registry.reset()


def test_counter_accumulates_per_label_series():
    metrics.registry.incr("ai_llm_calls_total", labels={"provider": "gemini", "status": "ok"})
    metrics.registry.incr("ai_llm_calls_total", labels={"provider": "gemini", "status": "ok"})
    metrics.registry.incr("ai_llm_calls_total", labels={"provider": "ollama", "status": "ok"})

    snap = metrics.registry.snapshot()["counters"]
    assert snap['ai_llm_calls_total{provider="gemini",status="ok"}'] == 2
    assert snap['ai_llm_calls_total{provider="ollama",status="ok"}'] == 1


def test_latency_tracks_sum_count_and_avg():
    metrics.registry.observe_latency("ai_llm_latency", 100.0, labels={"provider": "gemini"})
    metrics.registry.observe_latency("ai_llm_latency", 200.0, labels={"provider": "gemini"})

    lat = metrics.registry.snapshot()["latency"]['ai_llm_latency{provider="gemini"}']
    assert lat["count"] == 2
    assert lat["sum_ms"] == 300.0
    assert lat["avg_ms"] == 150.0


def test_record_llm_error_increments_error_series_and_cost():
    metrics.record_llm("gemini", "gemini-3.5-flash-lite", "error", 42.0)
    metrics.record_llm("gemini", "gemini-3.5-flash-lite", "ok", 30.0, cost_usd=0.001, total_tokens=250)

    snap = metrics.registry.snapshot()["counters"]
    assert snap['ai_llm_errors_total{model="gemini-3.5-flash-lite",provider="gemini"}'] == 1
    assert snap['ai_llm_tokens_total{model="gemini-3.5-flash-lite",provider="gemini"}'] == 250
    # Two calls total (one ok, one error) on the calls counter.
    assert snap['ai_llm_calls_total{model="gemini-3.5-flash-lite",provider="gemini",status="error"}'] == 1
    assert snap['ai_llm_calls_total{model="gemini-3.5-flash-lite",provider="gemini",status="ok"}'] == 1


def test_prometheus_render_is_well_formed():
    metrics.record_request("GET", "/search", 200, 12.5)
    text = metrics.registry.render_prometheus()

    assert 'ai_http_requests_total{method="GET",path="/search",status="200"} 1' in text
    assert "ai_http_request_latency_ms_count" in text
    assert "ai_http_request_latency_ms_sum" in text
    # Every line must be "name value" — no dangling series.
    for line in text.strip().splitlines():
        assert len(line.rsplit(" ", 1)) == 2


def test_recording_never_raises_on_bad_input():
    # Instrumentation must never take down a request, even with odd values.
    metrics.record_llm("p", "m", "ok", float("nan"))
    metrics.registry.render_prometheus()  # must not raise
