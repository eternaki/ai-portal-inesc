"""Shared test setup.

The LLM service remembers which providers are cooling off after a quota refusal,
in a module-level dict — deliberately, since it has to outlive a request. In a
test run it also outlives the test, and one that simulates a rate limit changes
which provider the next test gets. That is how a passing suite started failing on
an unrelated assertion, so the state is reset between tests rather than left for
whoever writes the next one to discover.
"""

import pytest

from app.llm import service as llm_service_module


@pytest.fixture(autouse=True)
def reset_provider_cooldowns():
    llm_service_module._cooling.clear()
    yield
    llm_service_module._cooling.clear()
