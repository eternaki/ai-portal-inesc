# MLKD Intelligent Research Platform — Project Overview

An AI-enhanced web platform for the **Machine Learning and Knowledge Discovery
(MLKD)** group at **INESC-ID**. It automatically collects the group's publications,
summarizes them with AI into plain language, makes them searchable by meaning, and
lets non-technical staff maintain everything through an admin panel.

> **Primary success criterion (from the brief): the site must be easy to maintain.**
> Adding a person, publication, news item or thesis topic is done through the admin
> panel — log in, edit a field, save.

Built by a 4-student Erasmus summer internship team (backend/architecture,
frontend/UX, AI & automation, data & visibility).

---

## 1. Technology stack

| Layer | Technology | Why |
|---|---|---|
| Site + admin | **Next.js 16 + Payload CMS 3** (TypeScript) | SSR/SEO; the admin panel replaces WordPress |
| AI service | **Python + FastAPI + LiteLLM** | All AI logic in one service; swap the LLM via one env var |
| Database | **PostgreSQL 16 + pgvector** | One DB for relational data *and* vector search |
| Publication data | **OpenAlex API** | Free, official, has abstracts + citations |
| LLM | **Gemini / Groq** (free tiers, swappable) | Summaries, bios, snippets, chat |
| Embeddings | **sentence-transformers** (local, MiniLM) | Semantic search, no API cost |
| Deploy | **Docker Compose** (local) · Vercel + Supabase + HF Spaces (cloud) | See `docs/DEPLOY.md` |

Three containers, one `docker compose up`: **web**, **ai**, **db**.

---

## 2. What the platform does (features)

### Public website
- **Home** — hero with a live scatter field, key stats, recent publications, news.
- **Publications** — filterable list; each detail page shows the AI summary
  (TL;DR / problem / method / results / takeaways / industry / impact), related
  citations (references + cited-by), a link to the original paper, and attached
  materials (code / documents / figures / datasets / links) with previews.
- **People** — group members with bios; a member can edit only their own profile.
- **Research** — theme cards, each with its most relevant publications (semantic).
- **Topic map** — 2D map of the group's research (UMAP + HDBSCAN clustering).
- **Search** — hybrid search (see §4).
- **Projects, Software, Opportunities (thesis topics), News, Events** — content pages.
- **RAG chatbot** — floating assistant on every public page; answers questions about
  the group's publications with citations, and refuses when it has no grounding.
- **Bilingual** — English + Português (header toggle); no other UI language.
- **SEO** — JSON-LD structured data, sitemap, robots, Open Graph.

### Admin panel (Payload CMS, `/admin`)
- Edit every content type through forms; changes appear on the site immediately.
- **AI summaries** are drafted automatically and remain human-editable; a human edit
  is protected from being overwritten by the pipeline.
- **Import a publication** by DOI / OpenAlex id / URL / title, with preview + duplicate
  check + approval (see §3).
- **Data-health dashboard** (maintenance report — see §5).
- **Runtime settings** (`ai-settings` global): switch the LLM model and toggle AI
  feature flags — no redeploy.
- **Generate social snippet** — one-click LinkedIn/X post text for a publication or
  news item.

---

## 3. Editorial workflow (human-in-the-loop)

Nothing an automated pipeline produces goes live. Each publication carries an
editorial `status`:

```
imported → pending_review → approved → published
                          ↘ rejected
     (pipeline error) → failed
```

- **Public visibility:** only `published`. Enforced in three places — the frontend
  filters every query, Payload access control returns a published-only constraint
  for non-editors, and the AI service filters search/chat/map.
- **Drafts by default:** OpenAlex ingest and the DOI importer create records as
  `pending_review`; re-ingesting an existing paper updates its metadata but never
  changes a human's decision.
- **Decision history:** every status change records the reviewer and is appended to
  an audit trail on the record.
- **Review queue:** the Publications admin list shows `status`; filter to
  `pending_review` to triage.
- **DOI/URL/title import:** admin pastes an identifier → the AI service resolves it
  against OpenAlex → shows a preview and a duplicate warning → on approval, a
  `pending_review` draft is created. Never publishes directly.

---

## 4. Search (hybrid)

Two signals fused with **Reciprocal Rank Fusion**:

1. **Semantic** — pgvector cosine similarity over sentence-transformers embeddings.
2. **Full-text** — PostgreSQL `ts_rank` over title + abstract + venue.

Filters: type, year range, author. Degrades gracefully — if embeddings are disabled
(feature flag) or unavailable, results fall back to full-text; if the whole AI
service is down, the site falls back to a CMS keyword query, so search never goes
dark. No LLM call is involved in search.

---

## 5. AI & operations

- **AI service abstracts the provider.** All LLM calls go through one module; the
  model is chosen at runtime from the admin (`ai-settings.llmModel` /`customModel`)
  with an env fallback. Swap the LLM with no code change.
- **The LLM is offline, never a runtime dependency.** The site renders fully with the
  AI provider down; summaries are a batch step stored in the CMS.
- **Feature flags** (`ai-settings.features`): `enableChatbot`,
  `enableSemanticSearch`, `enableSummaries` — toggle AI features site-wide.
- **Embedding tracking:** each embedding stores a `content_hash` (source text +
  model), so re-running the pipeline re-embeds only what changed.
- **Maintenance agent** (`GET /maintenance/report`, shown on the admin dashboard):
  a read-only data-health report — missing embeddings, duplicates, invalid DOIs,
  incomplete content, failed jobs, and (opt-in) broken links. It points a human at
  problems; it never edits data.
- **Testing:** unit tests for the search metrics (`pytest`), plus a search benchmark
  reporting **Precision@5, Recall@10, MRR, and latency** over a curated query set.

---

## 6. Admin access / credentials

> ⚠️ **These are LOCAL development credentials only.** They authenticate against a
> `localhost` database and are **not valid on any deployed instance**. On a fresh
> (cloud) database, you create the first admin at `/admin` on first visit and set
> your own password — never commit production credentials to the repository.

**Local admin (development):**
- URL: `http://localhost:3000/admin`
- Email: `admin@mlkd.local`
- Password: `MlkdAdmin2026!`
- Role: `admin` (full access)

There is also a `service@mlkd.local` user (role `editor`) used by the AI service to
write summaries back through the Payload REST API (authenticated by an API key, not a
password).

To reset or create an admin at any time (safe — does not boot Payload, so it never
touches the schema):

```bash
cd web
DATABASE_URL=postgresql://mlkd:mlkd@localhost:5432/mlkd \
  node scripts/set-admin-password.mjs admin@mlkd.local 'MlkdAdmin2026!'
```

---

## 7. Run it locally — everyone gets the publications

Requirements: **Docker**, **Node ≥ 20.9 + pnpm**, **Python 3.11**.

The repository ships a **seed database** (`db/seed/mlkd-seed.sql.gz`): 252 real
publications from OpenAlex + their embeddings + the topic map + the admin user.
Postgres loads it automatically the first time the `db` volume is created, so a
fresh clone comes up **with data and a working login** — no ingest needed.

### Option A — full stack in Docker (simplest, one command)

```bash
git clone <repo> && cd ai-portal-inesc
cp .env.example .env          # then set PAYLOAD_SECRET (openssl rand -hex 32)
                              # optional: GROQ_API_KEY for chat/summaries
docker compose up --build     # starts db (seeded) + web + ai
```

Open **http://localhost:3000** — 252 publications, search, and the topic map work
immediately. Admin at **http://localhost:3000/admin** (creds in §6).

### Option B — DB in Docker, web + ai on the host (for development)

```bash
cp .env.example .env          # set PAYLOAD_SECRET
docker compose up -d db       # Postgres + pgvector, auto-seeded on first run

# web
cd web && pnpm install
DATABASE_URL=postgresql://mlkd:mlkd@localhost:5432/mlkd \
  PAYLOAD_SECRET=<your secret> pnpm dev      # http://localhost:3000

# ai (new terminal)
cd ai && python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
DATABASE_URL=postgresql://mlkd:mlkd@localhost:5432/mlkd \
  PAYLOAD_URL=http://localhost:3000 .venv/bin/uvicorn app.main:app --port 8000
```

### What needs an API key, and what doesn't

| Works with **no** external key | Needs a free LLM key (`GROQ_API_KEY`) |
|---|---|
| Browsing publications, people, research, topic map | Chatbot answers |
| **Hybrid search** (full-text + semantic — embeddings run locally) | Generating new AI summaries / social snippets |

So the site is fully browsable and searchable out of the box. Get a free Groq key at
<https://console.groq.com> and put it in `.env` to enable chat + summarization.

### Notes
- The seed loads **only on a fresh volume**. To reseed from scratch:
  `docker compose down -v && docker compose up` (⚠️ wipes local DB changes).
- To (re)generate the seed from your own DB:
  `docker exec <pg> pg_dump -U mlkd -d mlkd --no-owner --no-privileges | gzip > db/seed/mlkd-seed.sql.gz`
- To pull more publications, add authors to `ai/data/authors.json` and run
  `python -m app.pipelines.ingest data/authors.json` (they arrive as drafts for review).

---

## 8. Project structure

```
web/   Next.js + Payload CMS
  src/collections/     content types (publications, members, news, events, …)
  src/globals/         ai-settings (model + feature flags)
  src/app/(frontend)/  public site pages
  src/app/(payload)/   auto-generated admin + REST/GraphQL API
  src/app/api/         route handlers (AI proxy, ingest, maintenance, chat)
  src/components/admin/ custom admin UI (import panel, maintenance panel)
  src/fields/          reusable fields (slug, editorial workflow)
  src/hooks/           collection hooks (auto-process, editorial decision log)
  src/access/          role-based access control
  src/migrations/      database migrations
ai/    FastAPI AI service
  app/api/routes.py    HTTP endpoints (search, map, chat, ingest, maintenance, …)
  app/pipelines/       batch jobs (ingest, embed, summarize, cluster, bios,
                       maintenance, benchmark)
  app/search.py        hybrid search (semantic + full-text, RRF)
  app/embeddings.py    sentence-transformers + pgvector
  app/llm/             the only place that calls an LLM (+ prompt templates)
docs/  specs, plans, this overview, IMPLEMENTATION.md (technical report), DEPLOY.md
```

---

## 8. Status & next step

All planned work (the supervisor's Final Implementation Plan, P0–P2) is **implemented,
verified on the live database, and merged to `main`**. The remaining step is the
**cloud deployment** — see `docs/DEPLOY.md` (Vercel + Supabase + Hugging Face Spaces,
all free tier).

For the technical narrative (architecture rationale, data flow, known limitations),
see `docs/IMPLEMENTATION.md`.
