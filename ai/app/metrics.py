"""In-process metrics for the AI service (latency, LLM cost, provider errors).

A tiny, dependency-free registry: counters and latency sums that a monitoring
system can scrape at ``GET /metrics`` in Prometheus text format. It is in-memory
and per-process — it answers "what is this instance doing now" (request rate,
latency, LLM call/error/cost, pipeline runs). Long-term persistence and
dashboards are the scraper's job (Prometheus/Grafana), not this module's.

Everything is best-effort and must never break a request: recording is guarded so
an instrumentation bug can never take down search or chat.
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict

logger = logging.getLogger(__name__)

# A metric key is (name, sorted label tuple) so the same metric can carry labels
# like provider="gemini" without a separate object per series.
_LabelKey = tuple[str, tuple[tuple[str, str], ...]]


class _Registry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[_LabelKey, float] = defaultdict(float)
        # Latency is stored as (sum_ms, count) per series so we can expose both a
        # total and derive an average without keeping every sample.
        self._latency_sum: dict[_LabelKey, float] = defaultdict(float)
        self._latency_count: dict[_LabelKey, float] = defaultdict(float)

    @staticmethod
    def _key(name: str, labels: dict[str, str] | None) -> _LabelKey:
        items = tuple(sorted((labels or {}).items()))
        return (name, items)

    def incr(self, name: str, *, labels: dict[str, str] | None = None, value: float = 1.0) -> None:
        try:
            with self._lock:
                self._counters[self._key(name, labels)] += value
        except Exception:  # noqa: BLE001 - metrics must never break the caller
            logger.debug("metrics incr failed for %s", name, exc_info=True)

    def observe_latency(self, name: str, ms: float, *, labels: dict[str, str] | None = None) -> None:
        try:
            key = self._key(name, labels)
            with self._lock:
                self._latency_sum[key] += ms
                self._latency_count[key] += 1
        except Exception:  # noqa: BLE001
            logger.debug("metrics observe_latency failed for %s", name, exc_info=True)

    def render_prometheus(self) -> str:
        """Render all series in Prometheus text exposition format."""
        with self._lock:
            counters = dict(self._counters)
            lat_sum = dict(self._latency_sum)
            lat_count = dict(self._latency_count)

        lines: list[str] = []
        for (name, labels), value in sorted(counters.items()):
            lines.append(f"{name}{_fmt_labels(labels)} {_fmt_num(value)}")
        for (name, labels), total in sorted(lat_sum.items()):
            lines.append(f"{name}_ms_sum{_fmt_labels(labels)} {_fmt_num(total)}")
        for (name, labels), count in sorted(lat_count.items()):
            lines.append(f"{name}_ms_count{_fmt_labels(labels)} {_fmt_num(count)}")
        return "\n".join(lines) + "\n"

    def snapshot(self) -> dict:
        """Structured view of the current metrics (used by tests and /metrics?format=json)."""
        with self._lock:
            return {
                "counters": {_series_id(k): v for k, v in self._counters.items()},
                "latency": {
                    _series_id(k): {
                        "sum_ms": self._latency_sum[k],
                        "count": self._latency_count[k],
                        "avg_ms": round(self._latency_sum[k] / self._latency_count[k], 2)
                        if self._latency_count[k]
                        else 0.0,
                    }
                    for k in self._latency_count
                },
            }

    def reset(self) -> None:
        """Clear all series. For tests only."""
        with self._lock:
            self._counters.clear()
            self._latency_sum.clear()
            self._latency_count.clear()


def _fmt_labels(labels: tuple[tuple[str, str], ...]) -> str:
    if not labels:
        return ""
    inner = ",".join(f'{k}="{_escape(v)}"' for k, v in labels)
    return "{" + inner + "}"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


def _fmt_num(value: float) -> str:
    # Integers print without a trailing ".0" to keep the exposition tidy.
    return str(int(value)) if float(value).is_integer() else repr(value)


def _series_id(key: _LabelKey) -> str:
    name, labels = key
    if not labels:
        return name
    return name + _fmt_labels(labels)


registry = _Registry()


# --- Domain helpers: the vocabulary the rest of the service records against. ---

def record_request(method: str, path: str, status: int, ms: float) -> None:
    labels = {"method": method, "path": path, "status": str(status)}
    registry.incr("ai_http_requests_total", labels=labels)
    registry.observe_latency("ai_http_request_latency", ms, labels={"method": method, "path": path})


def record_llm(provider: str, model: str, status: str, ms: float, *, cost_usd: float = 0.0, total_tokens: int = 0) -> None:
    labels = {"provider": provider, "model": model, "status": status}
    registry.incr("ai_llm_calls_total", labels=labels)
    if status != "ok":
        registry.incr("ai_llm_errors_total", labels={"provider": provider, "model": model})
    if cost_usd:
        registry.incr("ai_llm_cost_usd_total", labels={"provider": provider, "model": model}, value=cost_usd)
    if total_tokens:
        registry.incr("ai_llm_tokens_total", labels={"provider": provider, "model": model}, value=total_tokens)
    registry.observe_latency("ai_llm_latency", ms, labels={"provider": provider, "model": model})


def record_pipeline(name: str, status: str, ms: float) -> None:
    registry.incr("ai_pipeline_runs_total", labels={"pipeline": name, "status": status})
    registry.observe_latency("ai_pipeline_latency", ms, labels={"pipeline": name})
