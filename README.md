# MLKD Portal

AI-Enhanced Web Platform for the Machine Learning and Knowledge Discovery group (INESC-ID).

Docs: [design](docs/plans/2026-07-10-mlkd-portal-design.md) ·
[team plan](docs/plans/2026-07-10-mlkd-portal-plan.md) ·
[operations](docs/OPERATIONS.md) · agent/dev guide: [`CLAUDE.md`](CLAUDE.md)

## Structure

```
web/   Next.js 16 + Payload CMS 3 (TypeScript) — public site + admin (/admin)
ai/    Python FastAPI — LiteLLM wrapper, OpenAlex ingest, summaries, embeddings, search
docs/  design doc and plan
docker-compose.yml — Postgres+pgvector, web, ai
```

## Architecture

The portal is split into three services with clear ownership boundaries:

```text
Browser / admin user
        |
        v
web: Next.js + Payload CMS
  - public SSR pages
  - Payload admin UI
  - authenticated API facades (/api/chat, /api/ingest, /api/rag, /api/maintenance)
        |
        | HTTP, service token
        v
ai: FastAPI service
  - OpenAlex ingest
  - LLM summaries, bios, snippets
  - embeddings, hybrid search, topic map
  - admin RAG
        |
        v
db: PostgreSQL 16 + pgvector
  - Payload content tables
  - AI-owned embedding and topic-map tables

curated member dataset + importers
  - reviewed contacts and academic identifiers
  - reproducible updates for local/staging data
```

### Ownership rules

- Payload owns content: publications, members, projects, news, software, thesis
  topics, media, users, and AI settings.
- FastAPI owns AI data: publication embeddings and topic-map projections.
- The AI service never writes directly to Payload content tables. It writes CMS
  content only through the Payload REST API using `PAYLOAD_API_KEY`.
- Next.js reads CMS content through the Payload Local API and calls FastAPI only
  for AI/search workflows.
- LLM output is always stored as editable CMS fields or returned to an admin
  workflow; human-edited summaries are protected by `aiSummaryStatus=edited`.
- Member contacts and academic identifiers are curated in
  `web/data/mlkd-members-update.json` and imported through explicit scripts. Public
  visibility is controlled per channel in Payload (`showEmail`, `showLinkedIn`,
  `showORCID`, etc.).

### Main flows

Public pages:

```text
Browser -> Next.js SSR -> Payload Local API -> PostgreSQL
```

Publication ingest:

```text
Admin -> /api/ingest -> FastAPI -> OpenAlex -> Payload REST -> PostgreSQL
```

Publication processing:

```text
Admin/batch -> FastAPI -> LLM resolver -> LiteLLM -> Gemini/OpenRouter/Ollama
                         -> sentence-transformers -> Payload REST + pgvector
```

Search and topic map:

```text
Browser -> Next.js page -> FastAPI /search or /map -> pgvector + Payload REST
```

Admin RAG:

```text
Admin -> /api/rag -> FastAPI /rag/answer -> Payload REST -> LLM resolver -> LiteLLM -> structured answer
```

Member contacts and identifiers:

```text
Curated JSON dataset -> member importer -> Payload members -> /people
```

For normal environments the importer should use Payload authentication. For local
seed recovery, `web/scripts/import-members-db.mjs` can populate the local database
directly after restoring the seed.

Publication/member links:

```text
Publication author names -> safe member alias matcher -> publications.authors[].member
```

Run `npm --prefix web run publications:link-members` for a dry run and
`npm --prefix web run publications:link-members:apply` to backfill the database.
The command is idempotent, preserves existing author links, and reports ambiguous
names instead of guessing.

This keeps the public site resilient: regular pages and CMS editing continue to
work even if an LLM provider is unavailable. AI features are isolated behind
feature flags, service tokens, and admin/editor authentication where needed.

## Quick start (local development)

Requirements: Node ≥ 20.9, pnpm ≥ 9, Python 3.11+, Docker.

```bash
cp .env.example .env            # set PAYLOAD_SECRET (openssl rand -hex 32)
docker compose up -d db         # Postgres only

# terminal 1 — web
cd web
cp ../.env.example .env         # web reads DATABASE_URL/PAYLOAD_SECRET from web/.env
# fix DATABASE_URL: postgresql://mlkd:mlkd@localhost:5432/mlkd
pnpm install
pnpm dev                        # http://localhost:3000, admin at /admin

# terminal 2 — ai
cd ai
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000   # http://localhost:8000/docs
```

The first visit to `/admin` prompts you to create the first user (they become the
admin — set the role in the profile).

### Local seed and member data

The repository includes `db/seed/mlkd-seed.sql.gz` with publications, embeddings,
topic-map data, and local users. Postgres applies this seed only when the database
volume is created for the first time. If an old Docker volume already exists, the
site may come up empty.

On Windows, the recommended one-command setup is:

```powershell
scripts\local-setup.bat
```

Useful variants:

```powershell
scripts\local-setup.bat --start-web      # also starts http://localhost:3000
scripts\local-setup.bat --start-ai       # also starts http://localhost:8000/docs
scripts\local-setup.bat --reset-db       # recreates the local DB volume
scripts\local-setup.bat --reset-db --yes # same, without confirmation prompt
```

Quick check:

```bash
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd \
  -c "select 'members' as table, count(*) from members union all select 'publications', count(*) from publications;"
```

Expected local data after setup:

- 59 members
- 252 publications
- 252 publication embeddings

If the database is empty, restore the seed or recreate the volume, then import the
curated member dataset:

```bash
cd web
DATABASE_URL=postgresql://mlkd:mlkd@localhost:5432/mlkd \
  node scripts/import-members-db.mjs --apply
```

The importer reads `web/data/mlkd-members-update.json`, creates missing members,
fills empty contact/identifier fields, and reports conflicts instead of guessing.

## Everything in Docker (prod-like)

```bash
cp .env.example .env   # fill in the secrets
docker compose up --build
```

## Data pipelines

Pipelines need an API key: in the admin, create a user `service@mlkd` with the
`editor` role, enable "Enable API Key", and copy the key into `.env`
(`PAYLOAD_API_KEY`).

```bash
cd ai && source .venv/bin/activate

# 1. Publications from OpenAlex (input file: see data/authors.example.json)
python -m app.pipelines.ingest data/authors.json

# 2. AI summaries for publications without one (needs an LLM provider key in .env)
python -m app.pipelines.summarize --limit 10

# 3. Embeddings for semantic search
python -m app.pipelines.embed
curl 'http://localhost:8000/search?q=semantic+search+in+biomedical+texts'
```

An author's OpenAlex ID can be found at https://openalex.org (author page, the
`A...` in the URL).

## Admin RAG

RAG is admin-only and disabled until explicitly enabled:

```bash
RAG_ENABLED=true
AI_SERVICE_TOKEN=replace-with-a-long-random-token
```

The admin dashboard shows an **Admin RAG** workbench. It asks over CMS content
through the stable Next.js facade:

```text
POST /api/rag
```

Next.js authenticates the Payload admin/editor session and calls the internal AI
service endpoint:

```text
POST /rag/answer
```

The response is structured for the frontend: status, executive summary, grounded
evidence, limitations, citations, warnings, and model metadata. The admin RAG
retriever uses the multi-entity `entity_embeddings` index first (publications,
members, projects, thesis topics), then falls back to lexical retrieval with a
warning if the semantic index is unavailable. If the selected CMS sources do not
provide enough evidence, the assistant returns `insufficient_evidence` instead of
guessing. Model comparison is available only when requested from the admin
workbench.

## Chatbot LLM configuration

The chatbot, admin RAG, summaries, and snippets all use one server-side LiteLLM
layer. The recommended free cloud order is Gemini first, OpenRouter second, and
optional local Ollama for development:

```env
LLM_PROVIDER=auto
LLM_FALLBACK_ENABLED=true
LLM_FALLBACK_PROVIDERS=gemini,openrouter,ollama

GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite

OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openrouter/free
```

Check readiness without spending tokens:

```text
GET /health/llm
```

OpenRouter free models and Gemini free-tier quotas can change. The API returns
structured errors such as `LLM_NOT_CONFIGURED`, `PROVIDER_QUOTA_EXCEEDED`,
`PROVIDER_RATE_LIMITED`, and `MODEL_NOT_FOUND` instead of leaking provider stack
traces.

## Working agreements

- Branches `feat/...`, PR + review by one teammate.
- `main` always comes up with `docker compose up`.
- After changing Payload collections: `pnpm generate:types` (commit payload-types.ts).
- Keep `CLAUDE.md` in sync — run its checklist before every commit (the project map
  updates automatically).
