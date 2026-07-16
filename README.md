# MLKD Portal

AI-Enhanced Web Platform for the Machine Learning and Knowledge Discovery group (INESC-ID).

Docs: [design](docs/plans/2026-07-10-mlkd-portal-design.md) ·
[team plan](docs/plans/2026-07-10-mlkd-portal-plan.md) · agent/dev guide: [`CLAUDE.md`](CLAUDE.md)

## Structure

```
web/   Next.js 15 + Payload CMS 3 (TypeScript) — public site + admin (/admin)
ai/    Python FastAPI — LiteLLM wrapper, OpenAlex ingest, summaries, embeddings, search
docs/  design doc and plan
docker-compose.yml — Postgres+pgvector, web, ai
```

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

## Swapping the LLM

One line in `.env`: `LLM_MODEL=provider/model` (litellm format), plus the
provider's key in its standard variable. Examples:
`gemini/gemini-2.5-flash`, `openai/gpt-4o-mini`, `anthropic/claude-haiku-4-5`,
`ollama/llama3.1` (local). No code changes.

## Working agreements

- Branches `feat/...`, PR + review by one teammate.
- `main` always comes up with `docker compose up`.
- After changing Payload collections: `pnpm generate:types` (commit payload-types.ts).
- Keep `CLAUDE.md` in sync — run its checklist before every commit (the project map
  updates automatically).
