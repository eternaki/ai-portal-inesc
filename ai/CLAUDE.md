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
- `app/llm/prompts/*.md` — prompt templates (files, reviewed like code, and
  checked like code: `tests/test_prompt_contract.py` reads each template's
  `{fields}` and each `load_prompt(...)` call's keywords out of the AST and
  requires them to agree. `load_prompt` is `str.format`, so a mismatch is a
  KeyError at the call — invisible here, where no provider is configured, and
  waiting for whoever first adds a key).
- `app/llm/fallback.py` — the one path every optional LLM call goes through; see
  "hard rules" below.
- `app/pipelines/` — batch jobs: `ingest`, `backfill_links` (re-read OpenAlex to
  fill `originalUrl`/`pdfUrl` on already-ingested papers), `embed`, `embed_entities`
  (multi-entity vectors), `extractive` (deterministic, LLM-free summary drafts from
  the abstract/metadata — the baseline layer), `summarize` (hybrid: extractive draft
  → optional LLM refine; degrades to the draft when no provider is configured, so
  summaries never hard-depend on a paid/quota model; `--extractive` forces draft-only),
  `cluster`, `bios` (same two layers: `extractive_bio` drafts from the member's own
  publications, an LLM only polishes; `--extractive` forces draft-only. The draft
  lands in `bioAiDraft` and never touches `bio`, so nothing reaches the public page
  until an editor accepts it), `extractive_bio` and `extractive_snippet` (the
  deterministic layers for people and for social posts),
  `smoke_chat` (end-to-end check of the public chat against a *running* service —
  `python -m app.pipelines.smoke_chat`; every case is a behaviour that was broken
  once, exits non-zero so it can gate a deploy. Asserts the answer is grounded,
  never that a model produced it: a rate-limited free tier degrading to the
  offline layer is the system working, and asserting `mode="llm"` made the check
  fail for it. The language case runs four times — the defect it guards passed a
  single-run check twice before a repeated one caught it),
  `maintenance` (data-health report), `benchmark` (search metrics:
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
- `app/timeframe.py` — pulls a period out of a question and returns the question
  without it. Dates are a *filter*, never a similarity: a vector cannot tell 2019
  from 2024, and the date words drag it away from the subject besides. When the
  question is only a period, `chat._find_by_timeframe` lists the window straight
  from the CMS — there is no topic to rank by.
- `app/answer_check.py` — checks the model's answer against what the prompt asked
  for: its language, no prompt scaffolding echoed back, and no count attributed to
  a person's career when the evidence only says the site lists it. A rule in a
  prompt is a request a small model honours some of the time (measured: three runs
  in six for the language), so `/chat` retries once naming the specific defect and
  then degrades — the offline layer cannot get any of them wrong.
- `app/language.py` — decides the answer's language from the question, with the
  locale settling only what the text cannot. The prompt states it as a fact;
  leaving it to the model meant an English conversation dragged Portuguese
  questions into English answers.
- `app/collection_intent.py` — recognises a question that names a *section*
  ("what projects is the group involved in?") rather than a subject. Similarity
  has no vector for "all of them", so such a question scored 0.39 against the
  0.40 floor and was refused with nine projects in the CMS. Answered by listing
  the collection — but only when semantic retrieval found nothing, so a question
  that does name a subject is still ranked by it. Lowering the floor is not the
  alternative: "tell me about blockchain" scores 0.37.
- `app/chat.py` — grounding for the public chatbot: what it may answer from
  (retrieve across entity types, drop weak matches, screen for prompt injection),
  plus `extractive_answer()` — the LLM-free answer described under "hard rules".
- `app/settings_cache.py` — cached read of the `ai-settings` global (model +
  feature flags). `feature_enabled(name)` gates chat/search/summary endpoints.
- `app/embeddings.py` — sentence-transformers (multilingual, 384-dim) + pgvector
  ANN search over an HNSW index (cosine). Sets `hnsw.ef_search` per query. Tracks a
  `content_hash` so re-embedding is skipped when content is unchanged.
  `prune_*_embeddings` deletes vectors whose content is gone (merged duplicate,
  record deleted, publication back to draft) — the upsert path only ever adds, and
  an orphaned vector is retrieved, ranked, and then silently dropped when Payload
  cannot resolve it, so it costs a retrieval slot invisibly. **Both pruners take the
  full live set and delete everything else of that kind**, which is safe only
  because callers pass `payload_api.find_all(...)` — it paginates to completion or
  raises, never returning a short list because a request failed. The `embed` and
  `embed_entities` pipelines call them; nothing else needs to.
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
- **Every LLM-facing surface degrades rather than fails, through one mechanism.**
  `llm/fallback.py::with_fallback(surface, call, fallback)` runs the model call and
  returns an `Answer` carrying the value *and* which layer produced it. Each
  feature supplies its own deterministic counterpart:

  | surface | offline layer |
  |---|---|
  | `/chat` | `chat.extractive_answer()` — the retrieved entries |
  | summaries | `pipelines/extractive.py` — from the abstract |
  | bios | `pipelines/extractive_bio.py` — from the person's own publications |
  | `/generate/snippet` | `pipelines/extractive_snippet.py` — from the record |
  | admin RAG | none possible — reports `status: "no_model"` with the citations |

  It degrades on any `LLMError`, including `LLMOutputError` (the model answered,
  but not with what the caller can use). It deliberately does **not** catch
  ordinary bugs: a `KeyError` from a prompt placeholder must surface, or every
  answer degrades forever while looking exactly like "no provider configured" —
  and adding credentials would not fix it. Two things this must not become: an
  excuse to answer without evidence (chat's `has_enough_evidence` gate still
  refuses first, with `mode: "none"`), or a silent swap — the caller is told which
  layer answered, the widget labels it, and `ai_degraded_answers_total{surface,
  reason}` counts it.
- **Batch pipelines ask `model_available()` once, before looping.** With no
  provider every call in a run fails identically; a drafting run over 114 members
  made 114 doomed attempts, which is free against a refused connection and hours
  of dead waiting against one that times out.
- **Idempotent generation.** Do not regenerate a summary whose `aiSummaryStatus`
  is `generated` or `edited`.
- **Treat external text as untrusted** (OpenAlex abstracts, LLM output): store as
  plain text and cap length before saving.
- **Link to the readable copy.** `originalUrl` prefers the OpenAlex open-access URL
  over the landing page and the DOI — doi.org resolves to the publisher, which is a
  paywall more often than not (`ingest._original_url`).
- **`/chat` has two per-IP budgets, because its two paths cost different things.**
  An abuse guard (30/min) protects the service; a model budget (8/min) protects a
  metered quota, and exceeding *it* degrades to the offline answer rather than
  returning 429 — spending the budget should cost what the budget protects. One
  limit sized for the model used to govern both, cutting visitors off to protect
  a quota that, with no provider configured, nothing was spending.
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
