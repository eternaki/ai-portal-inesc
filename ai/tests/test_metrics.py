"""Unit tests for the in-process metrics registry (pure, no DB/LLM needed)."""

from app import metrics


def setup_function():
    metrics.registry.reset()


def test_counter_accumulates_per_label_series():
    metrics.registry.incr("ai_llm_calls_total", labels={"provider": "gemini", "status": "ok"})
    metrics.registry.incr("ai_llm_calls_total", labels={"provider": "gemini", "status": "ok"})
    metrics.registry.incr("ai_llm_calls_total", labels={"provider": "openrouter", "status": "ok"})

    snap = metrics.registry.snapshot()["counters"]
    assert snap['ai_llm_calls_total{provider="gemini",status="ok"}'] == 2
    assert snap['ai_llm_calls_total{provider="openrouter",status="ok"}'] == 1


def test_latency_tracks_sum_count_and_avg():
    metrics.registry.observe_latency("ai_llm_latency", 100.0, labels={"provider": "gemini"})
    metrics.registry.observe_latency("ai_llm_latency", 200.0, labels={"provider": "gemini"})

    lat = metrics.registry.snapshot()["latency"]['ai_llm_latency{provider="gemini"}']
    assert lat["count"] == 2
    assert lat["sum_ms"] == 300.0
    assert lat["avg_ms"] == 150.0


def test_percentiles_separate_the_cold_start_from_the_typical_request():
    # The real case that motivated histograms: one ~31s cold start (model load)
    # among fast warm calls. The mean says "15s", which describes nothing; p50
    # must still report a fast typical request and p95 must expose the outlier.
    metrics.registry.observe_latency("ai_http_request_latency", 31_000.0, labels={"path": "/search"})
    for _ in range(9):
        metrics.registry.observe_latency("ai_http_request_latency", 80.0, labels={"path": "/search"})

    lat = metrics.registry.snapshot()["latency"]['ai_http_request_latency{path="/search"}']
    assert lat["count"] == 10
    assert lat["avg_ms"] > 3_000        # the mean is dragged up by one sample...
    assert lat["p50_ms"] == 100         # ...while p50 still reports a fast request
    assert lat["p95_ms"] == 60_000      # and the tail is visible on its own


def test_percentiles_are_none_without_samples():
    lat = metrics.registry.snapshot()["latency"]
    assert lat == {}


def test_histogram_buckets_are_cumulative_and_exposed():
    for ms in (5.0, 60.0, 700.0):
        metrics.registry.observe_latency("ai_llm_latency", ms, labels={"provider": "gemini"})
    text = metrics.registry.render_prometheus()

    # Cumulative: everything <= 1000ms is in the 1000 bucket, +Inf holds them all.
    assert 'ai_llm_latency_ms_bucket{provider="gemini",le="5"} 1' in text
    assert 'ai_llm_latency_ms_bucket{provider="gemini",le="100"} 2' in text
    assert 'ai_llm_latency_ms_bucket{provider="gemini",le="1000"} 3' in text
    assert 'ai_llm_latency_ms_bucket{provider="gemini",le="+Inf"} 3' in text


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
