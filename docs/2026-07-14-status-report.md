# MLKD Portal — отчёт о состоянии проекта (к презентации 14.07.2026)

Демо-прототип портала исследовательской группы MLKD (INESC-ID) по ТЗ
«AI-Enhanced Web Platform for Research Group Visibility and Impact».
Код: https://github.com/eternaki/ai-portal-inesc (ветка `main`).

---

## 1. Что построено — в одном абзаце

Сайт группы, который **сам собирает свои данные**: публикации автоматически
подтягиваются из OpenAlex, AI-пайплайн генерирует к ним доступные саммари в семи
разрезах (от TL;DR до «зачем это индустрии»), эмбеддинги дают семантический поиск
(«поиск по смыслу, а не по словам») и карту тематических кластеров группы.
Весь контент редактируется не-технарями через админку с логином и ролями —
главная боль заказчика («painful to update people, media, publications») закрыта
архитектурно: добавление публикации = одна форма, саммари появляется само.

## 2. Архитектура

```
┌────────────────────────────────────────────────────────────┐
│ Docker Compose (3 контейнера, docker compose up)           │
│                                                            │
│  web (Next.js 16 + Payload CMS 3, TypeScript)              │
│    · публичный сайт (SSR — важно для SEO)                  │
│    · /admin: логин, роли admin/editor/member, self-edit    │
│    · 9 коллекций: publications, members, research-themes,  │
│      projects, software, thesis-topics, news, media, users │
│                         │ REST (API-key) ▲                 │
│                         ▼                │                 │
│  ai (Python FastAPI + LiteLLM)                             │
│    · пайплайны: ingest / summarize / embed / cluster / bios│
│    · эндпоинты: /search, /map, /process/publication,       │
│      /generate/snippet (все мутирующие — под токеном)      │
│                         │                                  │
│                         ▼                                  │
│  db (PostgreSQL + pgvector)                                │
│    · контентные таблицы (владеет Payload, миграции)        │
│    · publication_embeddings, topic_map (владеет AI-сервис) │
└────────────────────────────────────────────────────────────┘
```

Ключевые принципы:
- **LLM — офлайн-пайплайн, а не рантайм-зависимость.** Сайт полностью работает
  без доступного LLM API; саммари хранятся в CMS. Единственный рантайм-LLM —
  генерация соцсниппетов по кнопке.
- **Смена модели = смена конфига.** Все вызовы LLM идут через одну обёртку
  (LiteLLM); `LLM_MODEL=провайдер/модель` в `.env` — требование ТЗ выполняется
  буквально. Сейчас: Gemini (бесплатный тир). Промпты — отдельными файлами.
- **AI пишет в CMS только через REST** — всё сгенерированное видно и редактируемо
  в админке; ручная правка (`aiSummaryStatus=edited`) никогда не перезаписывается.
- **Эмбеддинги локальные** (sentence-transformers, 384-dim) — бесплатно, без
  ключей, пересчитываются в любой момент.

## 3. Покрытие требований ТЗ

| Раздел ТЗ | Статус | Что именно |
|---|---|---|
| **A. Research Discovery Portal** | ✅ ядро | 252 реальные публикации из OpenAlex (дедуп по DOI/openalexId), фильтры по годам, семантический поиск `/search`, карта тем `/map` (UMAP+HDBSCAN, 6 кластеров), related citations внутри корпуса |
| **B. AI Summarization** | ✅ | Саммари в стиле alphaxiv Blog mode: TL;DR/Problem/Method/Results/Takeaways + **два бенефициара из ТЗ**: For industry и Why it matters; кнопка «Generate social snippet» в админке (LinkedIn+X версии); share-кнопки на новостях |
| **C. Members & Alumni** | ✅ ядро | Профили с ролями, ORCID/LinkedIn (обязателен по ТЗ), opt-in email; AI-черновики био (bioAiDraft — владелец переносит в bio сам); self-edit проверен: своё — можно, чужое — 403, эскалация роли блокирована |
| **D. Opportunities** | ✅ ядро | `/opportunities`: открытые темы MSc/PhD с научруками и статусами, CRUD в админке |
| **E. Analytics & Visibility** | ✅ частично | JSON-LD (ScholarlyArticle/Person/Organization), sitemap.xml (262 URL), robots.txt, OG-меты; аналитика — ждёт выбора препода (Plausible vs GA) |
| **Maintainability (гл. критерий)** | ✅ | Админка для всего контента; автогенерация саммари при добавлении публикации; docker compose up; миграции БД для прода |
| Stretch: чат-бот, newsletter | ⏳ план | Спринт 6 по плану |

## 4. Как работает AI-конвейер (для слайда)

```
OpenAlex ──ingest──▶ Payload CMS ◀──правки людей (админка)
                        │
        ┌───────────────┼──────────────────┐
   summarize          embed            cluster
   (LLM, 7 полей)  (локальная модель)  (UMAP+HDBSCAN)
        │               │                  │
        ▼               ▼                  ▼
   саммари в CMS   pgvector ──▶ /search   topic_map ──▶ /map
```

Плюс автоматика: при добавлении/правке публикации в админке Payload-хук сам
вызывает AI-сервис (fire-and-forget) — саммари и эмбеддинг появляются фоном
через несколько секунд, сохранение не блокируется.

## 5. Проверено на живых данных (не мокапы)

- **252 публикации** Arlindo Oliveira (OpenAlex `A5001327675`) — ingest, дедуп,
  привязка авторства к профилю.
- **Саммари реальной моделью** (Gemini): все 7 секций, осмысленный текст;
  bio-черновик; соцсниппет через кнопку в админке — e2e.
- **Семантический поиск**: «biclustering gene expression» → топ-3 релевантных
  статьи (score 0.85+); карта тем: 6 кластеров с говорящими метками
  (gene regulation, coronary segmentation, haplotype inference, …).
- **Права**: member правит свой профиль (200), чужой — 403; роль себе поднять
  нельзя; мутирующие AI-эндпоинты