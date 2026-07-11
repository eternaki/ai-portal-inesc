# MLKD Portal

AI-Enhanced Web Platform for the Machine Learning and Knowledge Discovery group (INESC-ID).

Документы: [дизайн](docs/plans/2026-07-10-mlkd-portal-design.md) ·
[план команды](docs/plans/2026-07-10-mlkd-portal-plan.md)

## Структура

```
web/   Next.js 15 + Payload CMS 3 (TypeScript) — публичный сайт + админка (/admin)
ai/    Python FastAPI — LiteLLM-обёртка, ingest из OpenAlex, саммари, эмбеддинги, поиск
docs/  дизайн-док и план
docker-compose.yml — Postgres+pgvector, web, ai
```

## Быстрый старт (локальная разработка)

Требования: Node ≥ 20.9, pnpm ≥ 9, Python 3.11+, Docker.

```bash
cp .env.example .env            # заполнить PAYLOAD_SECRET (openssl rand -hex 32)
docker compose up -d db         # только Postgres

# терминал 1 — web
cd web
cp ../.env.example .env         # web читает DATABASE_URL/PAYLOAD_SECRET из web/.env
# поправьте DATABASE_URL: postgresql://mlkd:mlkd@localhost:5432/mlkd
pnpm install
pnpm dev                        # http://localhost:3000, админка /admin

# терминал 2 — ai
cd ai
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000   # http://localhost:8000/docs
```

Первый заход на `/admin` предложит создать первого пользователя (он станет admin —
роль выставить в профиле).

## Всё в Docker (prod-like)

```bash
cp .env.example .env   # заполнить секреты
docker compose up --build
```

## Пайплайны данных

Для пайплайнов нужен API-ключ: в админке создайте пользователя `service@mlkd`
с ролью `editor`, включите "Enable API Key", скопируйте ключ в `.env`
(`PAYLOAD_API_KEY`).

```bash
cd ai && source .venv/bin/activate

# 1. Публикации из OpenAlex (файл: см. data/authors.example.json)
python -m app.pipelines.ingest data/authors.json

# 2. AI-саммари для публикаций без саммари (нужен ключ LLM-провайдера в .env)
python -m app.pipelines.summarize --limit 10

# 3. Эмбеддинги для семантического поиска
python -m app.pipelines.embed
curl 'http://localhost:8000/search?q=semantic+search+in+biomedical+texts'
```

OpenAlex ID автора ищется на https://openalex.org (страница автора, `A...` в URL).

## Смена LLM

Одна строка в `.env`: `LLM_MODEL=провайдер/модель` (формат litellm), плюс ключ
провайдера в его стандартной переменной. Примеры:
`gemini/gemini-2.5-flash`, `openai/gpt-4o-mini`, `anthropic/claude-haiku-4-5`,
`ollama/llama3.1` (локально). Код не меняется.

## Правила работы

- Ветки `feat/...`, PR + ревью одного тиммейта.
- `main` всегда поднимается через `docker compose up`.
- После изменения коллекций Payload: `pnpm generate:types` (коммитить payload-types.ts).
