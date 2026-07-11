"""Конфигурация сервиса. Все значения берутся из переменных окружения / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres (тот же инстанс, что у Payload; свои таблицы — ai_*)
    database_url: str = "postgresql://mlkd:mlkd@localhost:5432/mlkd"

    # Payload CMS REST API
    payload_url: str = "http://localhost:3000"
    payload_api_key: str = ""  # API-ключ сервисного пользователя (users, role=editor)

    # LLM: смена модели = смена этой строки (litellm-формат "провайдер/модель").
    # Ключ провайдера — в его стандартной переменной (GEMINI_API_KEY, OPENAI_API_KEY, ...)
    llm_model: str = "gemini/gemini-2.5-flash"
    llm_temperature: float = 0.3
    llm_max_tokens: int = 2048

    # Локальная модель эмбеддингов (sentence-transformers)
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # OpenAlex "polite pool": укажите реальный email команды
    openalex_mailto: str = "mlkd-portal@example.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()
