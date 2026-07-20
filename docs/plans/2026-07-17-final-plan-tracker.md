# MLKD Platform — Final Implementation Plan tracker

Source of truth for the remaining work, matched against the supervisor's
**Final Implementation Plan** (`.context/attachments/AdjM2p/MLKD_Platform_Final_Implementation_Plan_EN.pdf`).
Goal: complete every item, then **deploy to Vercel** so anyone can try it.

> This file is the memory across context resets. Update the checkboxes as work lands.

## Where we are (2026-07-17)

- Repo: https://github.com/eternaki/ai-portal-inesc · default branch `main`.
- Working branch pattern: `feat/...` → PR → merge to `main` (self-merge OK, user approved autonomous work).
- Built so far (broad): Next.js 16 + Payload CMS 3 (web/), Python FastAPI + LiteLLM (ai/),
  Postgres+pgvector; pages: home, publications (+detail with AI summary, related citations,
  original link, attachments with previews), people, research, projects, software,
  opportunities, news, events, map (UMAP+HDBSCAN), search; RAG chatbot on all public pages;
  runtime model switching (Payload global `ai-settings`); social snippet button; SEO
  (JSON-LD, sitemap, robots, OG); i18n en/pt; auto-summary Payload hook.

## Local run (next session)

```bash
# 1. Postgres (Docker Desktop must be running)
open -a Docker            # wait for daemon
docker start mlkd-dev-pg  # existing container with data; if gone, recreate (see README + apply migrations)

# 2. AI service (ai/)
cd ai && .venv/bin/uvicorn app.main:app --port 8000

# 3. Web (production standalone — NOT `pnpm start`, output:standalone is on)
cd web && pnpm build
cp -r .next/static .next/standalone/.next/static ; cp -r public .next/standalone/public
DATABASE_URL=postgresql://mlkd:mlkd@localhost:5432/mlkd PAYLOAD_SECRET=<web/.env> \
  AI_SERVICE_URL=http://localhost:8000 AI_SERVICE_TOKEN=<from /tmp/mlkd-creds.txt> \
  MEDIA_DIR="$PWD/media" PORT=3000 node .next/standalone/server.js
```

- Admin creds for the local run live in `/tmp/mlkd-creds.txt` (admin@mlkd.local + service API key + ai token).
- Gemini free key currently used (in `ai/.env`, gitignored): `gemini/gemini-flash-lite-latest`
  works on it; `gemini-2.5-flash` is retired for new keys. Daily quota ~20 req on flash.
- Data is in the `mlkd-dev-pg` container (no volume) — if recreated, re-run ingest + embed + cluster.

## Gap analysis vs Final Plan

### ✅ Done / matches
- PostgreSQL + pgvector, migrations.
- Semantic (embedding) search.
- RAG chatbot with sources + refusal.
- Structured paper summarisation (problem/method/results/…).
- AI Service abstracts provider (swap model, no code change) + admin toggle.
- OpenAlex source, Gemini for AI.
- Modular web/ + ai/ split.

### Built this session (verified e2e on the live 252-paper DB — 2026-07-20)

**P0 — editorial workflow (nothing auto-publishes)** ✅
- [x] Editorial states: `imported → pending_review → approved → published / rejected / failed`,
      with append-only decision history + responsible reviewer (`fields/editorial.ts`,
      `hooks/recordEditorialDecision.ts`).
- [x] Public shows only `published` — frontend `PUBLISHED`/`published()` filter,
      `publishedOrPrivileged` access, AI service filters search/chat/map.
      Verified: flip pub→pending_review → public page 404 → restore → 200.
- [x] Ingest + DOI import create drafts (`pending_review`); re-ingest never changes status.
- [x] Review queue = Publications admin list filtered by `status` column.

**P0 — DOI ingest with preview + approval** ✅
- [x] Admin panel (Publications list): DOI/OpenAlex id/URL/title → `/ingest/lookup`
      (OpenAlex) → preview + dedup warning → approve → `/ingest/create` draft.
      Verified: lookup on existing DOI returns found+duplicate(status=published).
- [x] Ingestion agent (`resolve_publication`): identify → lookup → normalise → dedup → draft.

**P1 — hybrid search** ✅
- [x] Postgres full-text (`ts_rank`) + pgvector semantic, fused via RRF (`app/search.py`).
- [x] Filters (type, year_from/to, author) + CMS textual fallback when AI down.
      Verified: hybrid results with scores; type=journal filter narrows results.

**P1 — maintenance agent** ✅
- [x] `app/pipelines/maintenance.py` + `GET /maintenance/report` + dashboard `MaintenancePanel`:
      missing embeddings, duplicates, invalid DOIs, incomplete content, failed jobs, broken links.
      Verified: report on live DB (0 missing embeddings, 23 dup groups, 0 invalid DOIs).

**P2 — quality + ops** ✅
- [x] Embedding tracking: `content_hash` (text+model) skips unchanged re-embeds.
- [x] Feature flags (`ai-settings.features`): chatbot / semantic search / summaries.
- [x] Tests (`pytest` metric unit tests, 5 pass) + benchmark (`benchmark.py`:
      Precision@5, Recall@10, MRR, latency) with a curated-queries template.
- [x] Docs: `docs/IMPLEMENTATION.md` (architecture, editorial flow, search, ops, testing,
      limitations). Demo video still TODO (not code).

**FINAL — deploy to Vercel** ⬜ (needs a user decision on hosting the Python AI service)
- [ ] Web (Next.js + Payload) → Vercel.
- [ ] Postgres+pgvector → managed (Neon / Supabase — both support pgvector). Run Payload migrations.
- [ ] Media uploads → Vercel Blob or S3 (local disk `MEDIA_DIR` doesn't persist on Vercel).
- [ ] **AI service (Python FastAPI + torch/sentence-transformers) does NOT fit Vercel serverless.**
      Options: (a) host ai/ separately (Railway / Render / Fly.io) and point `AI_SERVICE_URL` at it;
      (b) move embeddings to a hosted embedding API (e.g. Gemini embeddings, as the plan's
      "External Services" suggests) and thin the Python service or port light parts to TS.
      → Decide with user before the deploy step.

## Notes / gotchas (don't rediscover)
- `output: 'standalone'` is on → run prod via `node .next/standalone/server.js`, not `pnpm start`.
  Kill stale `next-server` processes (`pkill -9 -f next-server`) — they hog :3000 and serve old builds.
- Turbopack dev is slow/panics under load; use production build to verify. `rm -rf web/.next` if a
  stale build serves old markup.
- litellm needs `tenacity` for retries; Gemini free tier needs throttling (`SUMMARIZE_DELAY_SEC`).
- Payload `generate:types` / `migrate:create` can hang on interactive prompts; DDL was applied
  directly for `ai-settings`, `events`, `publications.attachments/original_url` (see git history).
  For real migration files, generate them properly before the Vercel deploy.
- Open question from earlier, still unanswered: **public user registration model** (A: institute-domain
  only, B: open→member, C: invite-only). Needed if members should self-register to create content.
