"""Cached read of the Payload `ai-settings` global (runtime config).

The model id and the feature flags are set in the admin and read here without a
session. Cached briefly; any failure falls back to safe defaults so the AI
service never hard-depends on the CMS being up.
"""

import logging
import time

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_CACHE: dict = {"value": None, "at": 0.0}
_CACHE_TTL = 60.0


def ai_settings() -> dict:
    """The ai-settings global as a dict (empty on any failure)."""
    now = time.monotonic()
    if _CACHE["value"] is not None and now - _CACHE["at"] < _CACHE_TTL:
        return _CACHE["value"]
    data: dict = {}
    try:
        resp = httpx.get(
            f"{get_settings().payload_url}/api/globals/ai-settings", timeout=5.0
        )
        if resp.status_code == 200:
            data = resp.json()
    except Exception:
        logger.debug("ai-settings global unavailable, using defaults")
    _CACHE.update(value=data, at=now)
    return data


def feature_enabled(name: str, *, default: bool = True) -> bool:
    """Read a feature flag from ai-settings.features. Defaults to enabled."""
    features = ai_settings().get("features") or {}
    val = features.get(name)
    return default if val is None else bool(val)
