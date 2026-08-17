# ai/CLAUDE.md — FastAPI AI service

AI & automation service for the MLKD portal. **Read the root `CLAUDE.md` first**
(business, architecture, global rules). This file covers only the `ai/` specifics.

## Layout

- `app/main.py` — FastAPI app entry point.
- `app/api/routes.py` — HTTP endpoints (search, map, process, snippet, `/metrics`).
- `app/config.py` — settings from env (`Settings`, `get_settings()`). **All**
  configuration comes from env / `.env`.
- `app/llm/client.py` — **the only place that calls an LLM.** Public helpers:
  `complete`, `complete_json`, `load_prompt`.
- `app/llm/prompts/*.md` — prompt templates (files, reviewed like code).
- `app/pipelines/` — batch jobs: `ingest`, `backfill_links` (re-read OpenAlex to
  fill `originalUrl`/`pdfUrl` on already-ingested papers), `embed`, `embed_entities`
  (multi-entity vectors), `extractive` (deterministic, LLM-free summary drafts from
  the abstract/metadata — the baseline layer), `summarize` (hybrid: extractive draft
  → optional LLM refine; degrades to the draft when no provider is configured, so
  summaries never hard-depend on a paid/quota model; `--extractive` forces draft-only),
  `cluster`, `bios`, `maintenance` (data-health report), `benchmark` (search metrics:
  labelled P@5/Recall@10/MRR, plus label-free ANN recall via
  `python -m app.pipelines.benchmark --ann`), `coverage` (per-member publications on
  site vs the `knownPublicationCount` baseline vs OpenAlex `works_count` — "how many
  papers did the platform actually add"; read-only, `--openalex` opts into the network
  lookup). Ingest attaches an extractive summary to newly created papers, so a bulk
  import arrives with readable drafts and no LLM calls.
- `app/entities.py` — entity → embedding-text adapters (publications, members,
  projects, thesis topics). The ONLY type-specific code for the unified pipeline.
- `app/search.py` — hybrid search: pgvector semantic + Postgres full-text, fused
  (RRF). Reads the content table READ-ONLY for ranking; still writes nothing.
- `app/chat.py` — grounding for the public chatbot: what it may answer from
  (retrieve across entity types, drop weak matches, screen for prompt injection),
  plus `extractive_answer()` — the LLM-free answer described under "hard rules".
- `app/settings_cache.py` — cached read of the `ai-settings` global (model +
  feature flags). `feature_enabled(name)` gates chat/search/summary endpoints.
- `app/embeddings.py` — sentence-transformers (multilingual, 384-dim) + pgvector
  ANN search over an HNSW index (cosine). Sets `hnsw.ef_search` per query. Tracks a
  `content_hash` so re-embedding is skipped when content is unchanged.
- `app/metrics.py` — in-process metric registry (request/LLM latency, cost, errors)
  scraped at `GET /metrics` (Prometheus text or `?format=json`). Best-effort:
  instrumentation never breaks a request.
- `app/db.py` — Postgres connection + schema for **AI-owned tables only** (embedding
  tables carry HNSW indexes; tuning knobs `HNSW_*` in config).
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
- **Every LLM-facing surface degrades rather than fails.** Two layers, same shape
  in both places: a deterministic layer that is always available, which the model
  only refines. `pipelines/extractive.py` does this for summaries;
  `chat.extractive_answer()` does it for `/chat`, which returns the retrieved
  entries with `mode: "extractive"` on **any** `LLMError` — no key, exhausted
  free-tier quota, timeout. Retrieval never needed a model (embeddings are local),
  so losing the provider costs the phrasing, not the answer. Two things this must
  not become: an excuse to answer without evidence (the `has_enough_evidence` gate
  still refuses first, with `mode: "none"`), or a silent swap — the caller is told
  which layer answered and the widget labels it.
- **Idempotent generation.** Do not regenerate a summary whose `aiSummaryStatus`
  is `generated` or `edited`.
- **Treat external text as untrusted** (OpenAlex abstracts, LLM output): store as
  plain text and cap length before saving.
- **Link to the readable copy.** `originalUrl` prefers the OpenAlex open-access URL
  over the landing page and the DOI — doi.org resolves to the publisher, which is a
  paywall more often than not (`ingest._original_url`).
- Mutating endpoints (`/process/*`, `/generate/*`) require the `X-Service-Token`
  header; without `AI_SERVICE_TOKEN` configured they are disabled.

## Adding a pipeline

1. Create `app/pipelines/<name>.py` with a clear entry function.
2. Reuse `llm.client`, `embeddings`, `payload_api` — don't duplicate their logic.
3. If it needs an HTTP trigger, add an endpoint in `app/api/routes.py`.
4. Run the CLAUDE.md sync checklist (root §7).

## Commands & environment

- `uvicorn app.main:app --reload --port 8000` — dev (interactive docs at `/docs`).
- `python -m pytest -q` — tests (`tests/`). Set `DATABASE_URL` first or the ANN
  integration tests skip; CI sets it to a pgvector service container.
- **Python 3.11 recommended** — `torch` / `umap-learn` wheels may not exist yet for
  newer versions; use a dedicated 3.11 virtualenv.
