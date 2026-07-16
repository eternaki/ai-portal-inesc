"""Service configuration. Every value comes from environment variables / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres (same instance as Payload; the AI service has its own tables)
    database_url: str = "postgresql://mlkd:mlkd@localhost:5432/mlkd"

    # Payload CMS REST API
    payload_url: str = "http://localhost:3000"
    payload_api_key: str = ""  # service user's API key (users, role=editor)

    # Token for the AI service's mutating endpoints (/generate/*).
    # Without it those endpoints are disabled. Generate with: openssl rand -hex 32
    ai_service_token: str = ""

    # LLM: swapping models = changing this one line (litellm "provider/model" format).
    # The provider key lives in its standard variable (GEMINI_API_KEY, OPENAI_API_KEY, ...)
    llm_model: str = "gemini/gemini-2.5-flash"
    llm_temperature: float = 0.3
    llm_max_tokens: int = 2048

    # Local embedding model (sentence-transformers)
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # OpenAlex "polite pool": set the team's real email
    openalex_mailto: str = "mlkd-portal@example.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()
