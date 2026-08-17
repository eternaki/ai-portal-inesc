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
    # Not a reasoning model, deliberately. Every job here hands the model the
    # facts and asks it to phrase them, so thinking tokens buy nothing — and
    # qwen3:8b, the previous default, spent the whole llm_max_tokens budget
    # reasoning and returned empty content, which arrives as LLM_EMPTY_RESPONSE
    # and degrades every surface to its offline layer. Small also matters: this
    # runs on a laptop CPU/GPU beside the site, and 3B answers the chat in ~6s.
    ollama_model: str = "llama3.2:3b"

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

    # Public chatbot grounding. Mirrors the admin RAG's thresholds: the chat used
    # to answer from whatever retrieval returned, however weak, so a low score
    # floor and a minimum number of sources are what keep it honest.
    # 0.40, not the RAG's 0.25: measured on this corpus, real questions score
    # 0.51-0.68 while off-topic ones top out at 0.36 — sparse member bios ("Member
    # of the MLKD research group") embed generically and match almost anything
    # weakly, so the lower floor let nonsense through with people as "evidence".
    chat_max_sources: int = 6
    chat_min_semantic_score: float = 0.40
    chat_min_evidence_sources: int = 1

    # Local embedding model (sentence-transformers). Multilingual by default so
    # semantic search works on the group's Portuguese content as well as English.
    # This model is 384-dim — the same size as the older all-MiniLM-L6-v2 — so the
    # pgvector column and HNSW index are unchanged. Switching the model changes the
    # content_hash (model is part of it), so the embed pipeline re-embeds on the
    # next run without any manual reset.
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

    # pgvector HNSW approximate-nearest-neighbour index. ANN keeps vector search
    # sub-linear as the corpus grows; on today's small corpus a generous ef_search
    # keeps recall effectively exact. ef_search must be >= the largest LIMIT a query
    # uses (search over-fetches up to limit*4), or the index returns fewer rows and
    # recall drops. m / ef_construction only affect index build. All tunable via env.
    hnsw_m: int = 16
    hnsw_ef_construction: int = 64
    hnsw_ef_search: int = 100

    # OpenAlex "polite pool": set the team's real email
    openalex_mailto: str = "mlkd-portal@example.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()
