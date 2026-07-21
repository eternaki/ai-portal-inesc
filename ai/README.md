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
| `LLM_MODEL` | Default LiteLLM model id (e.g. `groq/llama-3.3-70b-versatile`) |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | Provider key for the chosen model |
| `OPENALEX_MAILTO` | Email for the OpenAlex polite pool |
| `EMBEDDING_DEVICE` | `cpu` (default) — Spaces are CPU-only |
| `RAG_MIN_SEMANTIC_SCORE` | Minimum semantic score for admin RAG evidence (default `0.25`) |

The architecture keeps the LLM offline: the website works fully even if this service
is down (search degrades to keyword-only, the chatbot is hidden).
