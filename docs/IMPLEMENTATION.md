# MLKD Platform — Implementation & Technical Report

Companion to `CLAUDE.md` (which is the living structural map). This document is the
narrative technical report the Final Implementation Plan asks for: architecture,
editorial workflow, search, operations, testing, and known limitations.

## 1. Architecture

Three containers, one `docker compose up`:

- **web** — Next.js 16 + Payload CMS 3 (TypeScript). Public site (SSR) + admin panel.
  Reads content via the Payload Local API; calls the AI service over HTTP.
- **ai** — Python FastAPI + LiteLLM. Search, chat, summarization, ingestion,
  maintenance. Owns only AI tables (embeddings, topic map); writes content back
  **only** through the Payload REST API (service key).
- **db** — PostgreSQL 16 + pgvector. One database for relational content *and*
  vectors.

**Ownership boundary (hard rule):** Payload owns content tables; the AI service
never writes to them via SQL, only via REST. It *reads* content tables via SQL in
exactly one place — full-text ranking (`app/search.py`) — because pulling every
abstract over REST to rank in Python would be strictly worse; this is read-only.

**The LLM is an offline/batch dependency, never a runtime one.** The site renders
fully with the AI service down: search degrades to keyword-only, the chatbot is
hidden, summaries are simply absent. `/search` uses pgvector + Postgres FTS, no LLM.

## 2. Editorial workflow (human-in-the-loop)

Nothing an automated pipeline produces goes live. Publications carry an editorial
`status`:

```
imported → pending_review → approved → published
                          ↘ rejected
   (pipeline error) → failed
```

- **Public visibility:** only `published`. Enforced two ways — the frontend filters
  every query (`src/lib/queries.ts` → `PUBLISHED`/`published()`), and the Payload
  `read` access (`publishedOrPrivileged`) returns a published-only constraint for
  anyone who is not an admin/editor (defense-in-depth for the REST/GraphQL API).
  The AI service also filters `status = published` in search, chat, and the map.
- **Drafts by default:** OpenAlex ingest and the DOI importer create records as
  `pending_review` (`payload_api.upsert_publication`). Re-ingesting an existing
  paper updates metadata but **never** touches its `status` (a human owns that).
- **Decision history:** every status change is stamped with the reviewer and
  appended to an append-only `reviewHistory` trail (`hooks/recordEditorialDecision`).
- **Review queue:** the Publications admin list shows `status`; filter by
  `pending_review` to triage.

### DOI / URL / title import (preview + approval)

Admin → Publications → “+ Import a publication”. Paste a DOI, OpenAlex id, URL, or
title → the AI service resolves it against OpenAlex (`/ingest/lookup`), shows a
preview and a **duplicate warning** (matched on openalexId/doi) → on approval,
`/ingest/create` writes a `pending_review` draft. Nothing is published directly.

## 3. Search (hybrid)

`app/search.py` fuses two signals with **Reciprocal Rank Fusion** (RRF, k=60):

1. **Semantic** — pgvector cosine over sentence-transformers embeddings.
2. **Full-text** — Postgres `to_tsvector`/`plainto_tsquery` `ts_rank` over
   title + abstract + venue.

Degrades gracefully: if the embedding path is disabled (feature flag) or
unavailable (torch not loaded), results fall back to pure full-text, and vice
versa. The `/search` endpoint applies filters (`type`, `year_from`, `year_to`,
`author`) via Payload and enforces `published`. When the whole AI service is down,
the web `/search` page falls back to a CMS keyword query so search never goes dark.

## 4. Operations

- **Maintenance agent** (`app/pipelines/maintenance.py`, `GET /maintenance/report`):
  read-only data-health report surfaced on the admin dashboard
  (`MaintenancePanel`). Checks: missing embeddings, duplicates (title/DOI), invalid
  DOIs, incomplete content (no abstract / no summary), failed jobs, and (opt-in)
  broken external links. It never edits data — it points a human at what to fix.
- **Feature flags** (`ai-settings` global → `features`): `enableChatbot`,
  `enableSemanticSearch`, `enableSummaries`. Read by the web app (chat widget) and
  the AI service (chat/search/summary endpoints). Toggle AI features with no redeploy.
- **Embedding tracking:** `publication_embeddings` stores a `content_hash` of
  (source text + model). Re-embedding is skipped when the hash is unchanged, so
  the pipeline is cheap to re-run and re-embeds only what actually changed
  (`embeddings.upsert_publication_embeddings`).
- **Runtime model switch:** `ai-settings.llmModel`/`customModel` → the AI service
  resolves the model per request (60 s cache, env fallback). Swap the LLM with no
  code change.

## 5. Testing & benchmark

- **Unit tests:** `ai/tests/test_search_metrics.py` — metric functions
  (Precision@k, Recall@k, MRR) and RRF fusion behavior. Run: `pytest` in `ai/`.
- **Search benchmark:** `app/pipelines/benchmark.py` evaluates hybrid search over a
  labeled query set and reports **Precision@5, Recall@10, MRR, and latency
  (avg/p50/p95)**. Ground truth is curated by hand — copy
  `ai/tests/benchmark_queries.example.json` to `benchmark_queries.json`, fill in the
  relevant publication ids, then `python -m app.pipelines.benchmark
  tests/benchmark_queries.json`. Relevance is never fabricated.

## 6. Known limitations

- Free-tier LLM quotas (Gemini ~20 req/day on flash) throttle bulk summarization;
  `SUMMARIZE_DELAY_SEC` paces it. Groq is the recommended free model (higher quota).
- The Python AI service (torch/sentence-transformers) does not fit Vercel
  serverless — it must be hosted separately (see the deploy section of the tracker).
- Broken-link checking is bounded (sampled) to keep the report fast.
- Full-text ranking recomputes `to_tsvector` on the fly (fine at this corpus size);
  a stored generated column + GIN index would scale it further.
- OpenAlex is the single bibliographic source; ORCID/DBLP cross-checks are not wired.

See `docs/plans/2026-07-17-final-plan-tracker.md` for the deliverable checklist and
the Vercel deployment plan.
