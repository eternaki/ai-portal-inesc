# ai/CLAUDE.md — FastAPI AI service

AI & automation service for the MLKD portal. **Read the root `CLAUDE.md` first**
(business, architecture, global rules). This file covers only the `ai/` specifics.

## Layout

- `app/main.py` — FastAPI app entry point.
- `app/api/routes.py` — HTTP endpoints (search, map, process, snippet).
- `app/config.py` — settings from env (`Settings`, `get_settings()`). **All**
  configuration comes from env / `.env`.
- `app/llm/client.py` — **the only place that calls an LLM.** Public helpers:
  `complete`, `complete_json`, `load_prompt`.
- `app/llm/prompts/*.md` — prompt templates (files, reviewed like code).
- `app/pipelines/` — batch jobs: `ingest`, `embed`, `summarize`, `cluster`, `bios`,
  `maintenance` (data-health report), `benchmark` (search metrics: P@5/Recall@10/MRR).
- `app/search.py` — hybrid search: pgvector semantic + Postgres full-text, fused
  (RRF). Reads the content table READ-ONLY for ranking; still writes nothing.
- `app/settings_cache.py` — cached read of the `ai-settings` global (model +
  feature flags). `feature_enabled(name)` gates chat/search/summary endpoints.
- `app/embeddings.py` — sentence-transformers + pgvector search. Tracks a
  `content_hash` so re-embedding is skipped when content is unchanged.
- `app/db.py` — Postgres connection for **AI-owned tables only**.
- `app/payload_api.py` — Payload REST client; the **only** way to write content back.
  Ingest creates drafts (`status=pending_review`); never publishes automatically.

## Hard rules

- **LLM only via `app/llm/client.py`.** Never call `litellm` or a provider SDK
  anywhere else. The model is `LLM_MODEL` in env — swapping models must never
  require a code change (brief requirement: "swap LLMs = config change").
- **Never write to Payload content tables via SQL.** Write content only through
  `payload_api` (REST + service key). `app/db.py` is for AI-owned tables
  (embeddings, topic map) only.
- **The LLM is offline, not a runtime dependency.** The site must work with the
  provider down. Generation runs as batch jobs or explicit endpoint triggers;
  results are stored in the CMS. `/search` uses pgvector only (no LLM call).
- **Idempotent generation.** Do not regenerate a summary whose `aiSummaryStatus`
  is `generated` or `edited`.
- **Treat external text as untrusted** (OpenAlex abstracts, LLM output): store as
  plain text and cap length before saving.
- Mutating endpoints (`/process/*`, `/generate/*`) require the `X-Service-Token`
  header; without `AI_SERVICE_TOKEN` configured they are disabled.

## Adding a pipeline

1. Create `app/pipelines/<name>.py` with a clear entry function.
2. Reuse `llm.client`, `embeddings`, `payload_api` — don't duplicate their logic.
3. If it needs an HTTP trigger, add an endpoint in `app/api/routes.py`.
4. Run the CLAUDE.md sync checklist (root §7).

## Commands & environment

- `uvicorn app.main:app --reload --port 8000` — dev (interactive docs at `/docs`).
- **Python 3.11 recommended** — `torch` / `umap-learn` wheels may not exist yet for
  newer versions; use a dedicated 3.11 virtualenv.
