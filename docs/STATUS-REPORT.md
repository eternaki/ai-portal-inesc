# MLKD Portal — Status Report

Project: AI-Enhanced Web Platform for Research Group Visibility and Impact (MLKD, INESC-ID).
Repository: https://github.com/eternaki/ai-portal-inesc

## What we built

A new website for the MLKD research group where all publications are collected
automatically, summarised by AI into plain language, searchable by meaning, and
easy to edit for non-technical people through a simple admin panel.

## What we used (tech stack)

| Part | Technology | Why |
|---|---|---|
| Website + admin panel | **Next.js + Payload CMS** (TypeScript) | Modern site with good SEO; the admin panel replaces WordPress — log in, edit a field, done |
| AI service | **Python + FastAPI + LiteLLM** | All AI logic in one service; switching to another LLM = changing one line in config |
| Database | **PostgreSQL + pgvector** | One database for both regular data and vector search — no extra services |
| Publication data | **OpenAlex API** (+ ORCID ids) | Free, official, has abstracts and citations. Google Scholar has no API, so we don't scrape it |
| LLM | **Gemini** (free tier for now) | Generates summaries; any provider works via LiteLLM |
| Embeddings | **sentence-transformers** (local, free) | Powers semantic search — no API costs |
| Deployment | **Docker Compose** | The whole system starts with one command |

## What is done

- **252 real publications** imported automatically from OpenAlex (prof. Arlindo Oliveira)
- **AI summaries** in 7 sections (TL;DR, Problem, Method, Results, Takeaways,
  For industry, Why it matters) — 15 done with the real model, the rest are limited
  only by the free API quota (~20/day)
- **Semantic search** — type a topic in your own words, results are ranked by meaning
- **Research map** — all publications as dots on a 2D map, clustered into 6 topics
  automatically (UMAP + HDBSCAN)
- **Auto-generation** — when someone adds or edits a publication in the admin panel,
  the summary and search index update by themselves
- **People profiles** with self-edit: each member can log in and edit only their own
  profile (verified: own = allowed, others = forbidden)
- **AI bio drafts** — a pipeline drafts a short bio from a member's publications;
  the member edits it before publishing
- **Opportunities page** — open MSc/PhD thesis topics to attract students
- **News section** with share buttons and a one-click AI-generated social media post
  (LinkedIn + X) in the admin panel
- **SEO package** — structured metadata (schema.org), sitemap (262 URLs), robots.txt,
  OpenGraph tags
- **Custom design** — "map of knowledge" concept: publications as points in embedding
  space; cobalt = navigation, amber = AI-generated content; STIX typeface (the font
  of scientific journals)

## How it works (simple)

```
OpenAlex ──> ingest pipeline ──> CMS (Payload) ──> website pages
                                   │    ▲
                embeddings ────────┘    │ AI writes summaries back
                (pgvector)          LLM (Gemini via LiteLLM)
```

The key decision: **the LLM works offline, not at page load.** Summaries are
generated in advance and stored in the CMS. The website works fully even if the
AI service or the LLM provider is down. People can always edit AI output by hand —
edited text is never overwritten.

## Security basics

Roles (admin / editor / member); members can only edit their own profile;
AI endpoints protected by tokens; database not exposed to the network;
untrusted external data is escaped before rendering.

## Next steps

1. **Add all group members** — we need their OpenAlex/ORCID ids (currently 1 profile for the demo)
2. **Summaries for the full corpus** — needs a paid LLM key (cents) or a few days of free quota
3. **Deploy to the INESC-ID server** — DB migrations are ready, we need server access
4. **Analytics** (Plausible or Google Analytics) — to be chosen with the supervisor
5. Stretch goals from the brief, pending supervisor's priorities: RAG chatbot over
   publications, newsletter generator, auto-posting to X, AI figure generation,
   EURAXESS integration

## Team roles (as in the brief)

Backend/architecture · Frontend/UX · AI & automation · Data & visibility —
the codebase is split accordingly: `web/` (site+CMS), `ai/` (pipelines), `docs/` (plans).
