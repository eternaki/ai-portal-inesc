# MLKD Portal — дизайн-документ

Проект: AI-Enhanced Web Platform for Research Group Visibility and Impact (MLKD, INESC-ID).
Дата: 2026-07-10. Статус: утверждён командой.

## 1. Цель и главный критерий успеха

Сделать современный сайт исследовательской группы с AI-возможностями (поиск, саммари,
визуализации), при этом **главный критерий из ТЗ — лёгкость поддержки**: добавить
человека, публикацию, новость или тему тезиса должно быть проще, чем на текущем сайте.
Любое архитектурное решение проверяем вопросом: «не усложняет ли это поддержку?»

Обязательные дельиверабли (из ТЗ, раздел 6):
1. Рабочий прототип сайта
2. Структурированная searchable база публикаций
3. Инструмент AI-саммаризации
4. Черновики профилей members/alumni (AI-assisted, редактируемые владельцем)
5. Proposal по долгосрочной поддержке
6. Документация и техотчёт

Stretch (делаем только после ядра): интерактивная визуализация тем, чат-бот, newsletter.

## 2. Архитектура

```
┌────────────────────────────────────────────────────────────┐
│ Docker Compose                                             │
│                                                            │
│  ┌──────────────────────┐      ┌────────────────────────┐  │
│  │ web  (Next.js 15 +   │      │ ai  (Python FastAPI)   │  │
│  │ Payload CMS 3, TS)   │      │  - LiteLLM-обёртка     │  │
│  │  - публичный сайт    │◄────►│  - sentence-transformers│ │
│  │  - /admin (логин,    │ REST │  - pipelines: ingest,  │  │
│  │    роли, медиа)      │      │    summarize, cluster  │  │
│  └──────────┬───────────┘      └───────────┬────────────┘  │
│             │                              │               │
│         ┌───▼──────────────────────────────▼───┐           │
│         │ db  (PostgreSQL 16 + pgvector)       │           │
│         └──────────────────────────────────────┘           │
└────────────────────────────────────────────────────────────┘
```

Три контейнера, один `docker compose up`. Это же — основа proposal по поддержке:
воспроизводимый деплой на сервер INESC-ID.

### Разграничение ответственности (важно!)

- **Payload владеет контентом.** Все таблицы коллекций (publications, members, …)
  создаёт и мигрирует Payload. Никто больше в них не пишет напрямую.
- **FastAPI владеет AI-данными.** Свои таблицы: `publication_embeddings`,
  `member_embeddings`, `topic_clusters`. В контентные таблицы Payload FastAPI
  **не пишет напрямую** — только через Payload REST API (сервисный API-ключ).
  Так саммари и черновики био попадают в админку и остаются редактируемыми людьми.
- **Next.js (фронт)** читает контент через Payload Local API (внутри одного
  процесса), а поиск/чат — через HTTP к FastAPI.

### Почему так
- Саммари, записанное в Payload-поле, редактируемо в админке → закрывает требование
  «profile owners can customise» и «easy updates».
- Эмбеддинги — не контент, людям их редактировать не нужно → живут отдельно,
  их можно пересчитать в любой момент без риска затереть ручные правки.

## 3. Модель данных (коллекции Payload)

| Коллекция | Ключевые поля | Примечания |
|---|---|---|
| `users` | email, роль (admin / editor / member) | member видит и правит только свой профиль |
| `members` | name, role (faculty/phd/msc/alumni), photo, bio (rich text), bioAiDraft, researchInterests[], orcid, dblpKey, openalexId, linkedin (**обязателен** или técnico/personal page), email, showEmail (opt-in), careerTrajectory (для alumni) | связь с users для self-edit |
| `publications` | title, year, venue, type (journal/conf/workshop/book), doi, openalexId, abstract, authors[] (связь с members + внешние строкой), pdfUrl, citationCount, **aiSummary** (группа полей: tldr, problem, method, results, takeaways), aiSummaryStatus (none/generated/edited), socialSnippet | uникальность по DOI/openalexId |
| `projects` | title, type (national/international), funding, period, description, members[] | |
| `software` | name, description, repoUrl, publications[] | tools & datasets |
| `thesisTopics` | title, advisor(s), level (MSc/PhD), status (open/taken), description, relatedThemes[] | боль заказчика №1 — CRUD в админке |
| `researchThemes` | name, description, members[], keyPublications[] | тематические линии группы |
| `news` | title, body, date, coverImage, socialSnippet | media-секция; сниппет для LinkedIn/X генерится по кнопке |
| `media` | стандартная медиа-библиотека Payload | |

Таблицы FastAPI (вне Payload):

```sql
publication_embeddings(publication_id, model text, embedding vector(1024), updated_at)
member_embeddings(member_id, model, embedding vector(1024), updated_at)
-- кластеры/координаты для карты тем пересчитываются пайплайном cluster.py
topic_map(publication_id, cluster_id, x float, y float, label text, computed_at)
```

## 4. AI-часть

Принцип: **LLM — офлайн-пайплайн, а не рантайм-зависимость сайта.**
Сайт полностью работает без доступного LLM API; генерация — батчем, результат в CMS.

- **Генерация (саммари, био, сниппеты):** API-модели через LiteLLM.
  Модель задаётся `LLM_MODEL=провайдер/модель` в `.env` — требование ТЗ
  «swap LLMs = config change» выполняется буквально. Старт — бесплатный тир
  Gemini Flash; при появлении бюджета/ключей — любая дешёвая модель
  (стоимость саммаризации всего корпуса ~$15–30 разово).
- **Эмбеддинги:** локально, `sentence-transformers` / `BAAI/bge-m3` → pgvector.
  Бесплатно, без ключей, пересчитывается когда угодно.
- **Промпты** — отдельными файлами в `ai/llm/prompts/`, ревьюятся как код.
- Формат саммари — alphaxiv «Blog mode»: Summary / Problem / Method / Results / Takeaways.
- `aiSummaryStatus=edited` защищает ручные правки: пайплайн не перезаписывает
  отредактированное человеком.

Пайплайны (запуск: вручную из админки/CLI, потом cron):
1. `ingest` — OpenAlex (основной источник: abstracts, цитирования) + DBLP
   (контроль качества метаданных CS) → матчинг по DOI → upsert в Payload.
2. `embed` — новые/изменённые публикации → эмбеддинги → pgvector.
3. `summarize` — публикации с `aiSummaryStatus=none` → LLM → поля в Payload.
4. `cluster` — UMAP + HDBSCAN по эмбеддингам → topic_map для визуализации.

Рантайм-эндпоинты FastAPI:
- `GET /search?q=` — эмбеддинг запроса + косинусный поиск в pgvector (LLM не нужен).
- `POST /generate/snippet` — по кнопке в админке: новость/статья → готовый пост
  для LinkedIn/X.
- `POST /chat` — RAG чат-бот (stretch, неделя 6).

## 5. LinkedIn / Twitter(X)

Читать ленты соцсетей на сайт — нереалистично (чтение X API платное от ~$200/мес,
у LinkedIn нет публичного read API). Поэтому направление обратное:

- **MVP:** media-секция живёт в CMS; кнопка «Generate social snippet» → AI-текст
  поста → копипаст/share-intent ссылки в LinkedIn и X. Это и есть
  «facilitate the media update» из ТЗ.
- **Stretch:** автопостинг в X через бесплатный тир API (~500 постов/мес — хватает);
  автопостинг на LinkedIn-страницу организации требует одобрения
  Community Management API — подать заявку заранее, если группа захочет.

## 6. SEO и видимость

- Next.js SSR/ISR: все публичные страницы рендерятся на сервере.
- JSON-LD: `ScholarlyArticle` для публикаций, `Person` для профилей,
  `Organization` для группы.
- `sitemap.xml`, `robots.txt`, канонические URL, OpenGraph-теги.
- Аналитика: Plausible (self-host, GDPR-friendly) или GA4 — решить с преподом.

## 7. Риски

| Риск | Митигация |
|---|---|
| Грязные данные публикаций (дубли, чужие однофамильцы) | матчить по ORCID/OpenAlex author ID, а не по имени; ручная верификация в админке (поле `verified`) |
| Нет бюджета на LLM | free tier Gemini; генерация батчами; сайт от LLM не зависит |
| Payload 3 незнаком команде | он «просто Next.js-приложение»; вертикальный срез недели 1 снимает риск рано |
| Деплой на сервер INESC затянется | Docker Compose с первого дня; спросить доступ к серверу уже на неделе 2 |
| Scope creep (в ТЗ много идей) | ядро = дельиверабли раздела 6 ТЗ; stretch только после недели 5 |
