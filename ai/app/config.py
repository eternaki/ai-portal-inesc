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

    # LLM generation. Embeddings are configured separately below.
    llm_provider: str = "auto"
    llm_model: str = ""
    llm_timeout_seconds: float = 60.0
    llm_max_retries: int = 1
    llm_temperature: float = 0.2
    llm_max_tokens: int = 1200
    llm_fallback_enabled: bool = True
    llm_fallback_providers: str = "gemini,openrouter,ollama"

    # Cloud/local provider settings. Keys must stay server-side.
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "openrouter/free"
    openrouter_site_url: str = ""
    openrouter_app_name: str = "MLKD Intelligent Research Platform"

    gemini_api_key: str = ""
    google_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:8b"

    openai_api_key: str = ""
    openai_model: str = ""

    # Admin RAG. Disabled by default so it can be introduced behind a flag.
    rag_enabled: bool = False
    rag_max_sources: int = 8
    rag_max_question_chars: int = 500
    rag_max_context_chars: int = 12000
    rag_timeout_seconds: float = 60.0
    rag_min_evidence_sources: int = 2
    rag_min_source_score: float = 0.05
    rag_min_semantic_score: float = 0.25

    # Local embedding model (sentence-transformers)
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # OpenAlex "polite pool": set the team's real email
    openalex_mailto: str = "mlkd-portal@example.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()
