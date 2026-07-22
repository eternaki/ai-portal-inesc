---
title: MLKD AI Service
emoji: 🔬
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 8000
pinned: false
---

# MLKD AI Service

FastAPI + LiteLLM service for the MLKD Intelligent Research Platform: hybrid search,
RAG chatbot, publication summarization, ingestion, and a maintenance report.

This folder is deployable as a **Hugging Face Docker Space** (free CPU tier). The YAML
front matter above configures the Space (Docker SDK, port 8000). See `docs/DEPLOY.md`
in the main repository for the full cloud deployment guide.

## Local development

```bash
uvicorn app.main:app --reload --port 8000   # docs at http://localhost:8000/docs
```

## Required environment variables (Space secrets)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL + pgvector (Supabase) connection string |
| `PAYLOAD_URL` | Base URL of the web app (Vercel), for the Payload REST API |
| `PAYLOAD_API_KEY` | Service user API key (writes summaries back to the CMS) |
| `AI_SERVICE_TOKEN` | Shared secret guarding mutating endpoints |
| `LLM_PROVIDER` | `auto`, `gemini`, `openrouter`, `ollama`, or `openai` |
| `LLM_FALLBACK_ENABLED` | `true` to try the next configured provider after provider failures |
| `LLM_FALLBACK_PROVIDERS` | Ordered list, recommended `gemini,openrouter,ollama` |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Gemini key; first free cloud provider |
| `GEMINI_MODEL` | Default `gemini-3.5-flash-lite` |
| `OPENROUTER_API_KEY` | OpenRouter key; fallback cloud provider |
| `OPENROUTER_MODEL` | Default `openrouter/free`; free availability and quotas can change |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Optional local fallback for development |
| `OPENALEX_MAILTO` | Email for the OpenAlex polite pool |
| `EMBEDDING_DEVICE` | `cpu` (default) — Spaces are CPU-only |
| `RAG_MIN_SEMANTIC_SCORE` | Minimum semantic score for admin RAG evidence (default `0.25`) |

The architecture keeps the LLM isolated: the website works even if no provider is
configured. Use `/health/llm` to check chatbot readiness without making a billable
generation request.
