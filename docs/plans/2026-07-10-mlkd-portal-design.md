# MLKD Portal — design document

Project: AI-Enhanced Web Platform for Research Group Visibility and Impact (MLKD, INESC-ID).
Date: 2026-07-10. Status: approved by the team.

## 1. Goal and primary success criterion

Build a modern research-group website with AI features (search, summaries,
visualizations). The **primary criterion from the brief is ease of maintenance**:
adding a person, publication, news item or thesis topic must be *easier* than on
the current site. Sanity-check every architectural decision with: "does this make
maintenance harder?"

Mandatory deliverables (brief, section 6):
1. A working site prototype
2. A structured, searchable publications database
3. An AI summarization tool
4. Draft member/alumni profiles (AI-assisted, editable by the owner)
5. A long-term maintenance proposal
6. Documentation and a technical report

Stretch (only after the core): interactive theme visualization, chatbot, newsletter.

## 2. Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Docker Compose                                             │
│                                                            │
│  ┌──────────────────────┐      ┌────────────────────────┐  │
│  │ web  (Next.js 15 +   │      │ ai  (Python FastAPI)   │  │
│  │ Payload CMS 3, TS)   │      │  - LiteLLM wrapper     │  │
│  │  - public site       │◄────►│  - sentence-transformers│ │
│  │  - /admin (login,    │ REST │  - pipelines: ingest,  │  │
│  │    roles, media)     │      │    summarize, cluster  │  │
│  └──────────┬───────────┘      └───────────┬────────────┘  │
│             │                              │               │
│         ┌───▼──────────────────────────────▼───┐           │
│         │ db  (PostgreSQL 16 + pgvector)       │           │
│         └──────────────────────────────────────┘           │
└────────────────────────────────────────────────────────────┘
```

Three containers, one `docker compose up`. This is also the basis of the
maintenance proposal: a reproducible deployment to the INESC-ID server.

### Separation of responsibilities (important!)

- **Payload owns content.** All collection tables (publications, members, …) are
  created and migrated by Payload. Nothing else writes to them directly.
- **FastAPI owns AI data.** Its own tables: `publication_embeddings`,
  `member_embeddings`, `topic_clusters`. FastAPI does **not** write to Payload
  content tables directly — only through the Payload REST API (service API key).
  This is how summaries and bio drafts reach the admin and stay human-editable.
- **Next.js (frontend)** reads content via the Payload Local API (in the same
  process); search/chat go over HTTP to FastAPI.

### Why this way
- A summary stored in a Payload field is editable in the admin → satisfies
  "profile owners can customise" and "easy updates".
- Embeddings are not content and nobody needs to edit them → they live separately
  and can be recomputed anytime without clobbering manual edits.

## 3. Data model (Payload collections)

| Collection | Key fields | Notes |
|---|---|---|
| `users` | email, role (admin / editor / member) | a member can see and edit only their own profile |
| `members` | name, role (faculty/phd/msc/alumni), photo, bio (rich text), bioAiDraft, researchInterests[], orcid, dblpKey, openalexId, linkedin (**required**, or técnico/personal page), email, showEmail (opt-in), careerTrajectory (for alumni) | linked to `users` for self-edit |
| `publications` | title, year, venue, type (journal/conf/workshop/book), doi, openalexId, abstract, authors[] (relation to members + external strings), pdfUrl, citationCount, **aiSummary** (field group: tldr, problem, method, results, takeaways), aiSummaryStatus (none/generated/edited), socialSnippet | unique by DOI/openalexId |
| `projects` | title, type (national/international), funding, period, description, members[] | |
| `software` | name, description, repoUrl, publications[] | tools & datasets |
| `thesisTopics` | title, advisor(s), level (MSc/PhD), status (open/taken), description, relatedThemes[] | client pain point #1 — CRUD in the admin |
| `researchThemes` | name, description, members[], keyPublications[] | the group's thematic lines |
| `news` | title, body, date, coverImage, socialSnippet | media section; the LinkedIn/X snippet is generated on demand |
| `media` | standard Payload media library | |

FastAPI tables (outside Payload):

```sql
publication_embeddings(publication_id, model text, embedding vector(1024), updated_at)
member_embeddings(member_id, model, embedding vector(1024), updated_at)
-- clusters/coordinates for the topic map are recomputed by the cluster.py pipeline
topic_map(publication_id, cluster_id, x float, y float, label text, computed_at)
```

## 4. AI part

Principle: **the LLM is an offline pipeline, not a runtime dependency of the site.**
The site works fully without an available LLM API; generation runs in batches and
the result is stored in the CMS.

- **Generation (summaries, bios, snippets):** API models via LiteLLM. The model is
  set by `LLM_MODEL=provider/model` in `.env` — the brief's requirement "swap LLMs
  = config change" is met literally. Start with the Gemini Flash free tier; once a
  budget/keys appear, any cheap model works (summarizing the whole corpus is a
  one-off ~$15–30).
- **Embeddings:** local, `sentence-transformers` / `BAAI/bge-m3` → pgvector. Free,
  no keys, recomputable anytime.
- **Prompts** — separate files in `ai/llm/prompts/`, reviewed like code.
- Summary format — alphaxiv "Blog mode": Summary / Problem / Method / Results /
  Takeaways.
- `aiSummaryStatus=edited` protects manual edits: the pipeline never overwrites
  what a human has edited.

Pipelines (run manually from the admin/CLI, later via cron):
1. `ingest` — OpenAlex (primary source: abstracts, citations) + DBLP (CS metadata
   quality control) → DOI matching → upsert into Payload.
2. `embed` — new/changed publications → embeddings → pgvector.
3. `summarize` — publications with `aiSummaryStatus=none` → LLM → fields in Payload.
4. `cluster` — UMAP + HDBSCAN over embeddings → topic_map for the visualization.

FastAPI runtime endpoints:
- `GET /search?q=` — query embedding + cosine search in pgvector (no LLM needed).
- `POST /generate/snippet` — on demand from the admin: news/paper → a ready
  LinkedIn/X post.
- `POST /chat` — RAG chatbot (stretch, week 6).

## 5. LinkedIn / Twitter (X)

Pulling social feeds onto the site is unrealistic (reading the X API costs ~$200/mo
and up; LinkedIn has no public read API). So the direction is reversed:

- **MVP:** the media section lives in the CMS; a "Generate social snippet" button →
  AI post text → copy/paste + share-intent links to LinkedIn and X. This is the
  brief's "facilitate the media update".
- **Stretch:** auto-posting to X via the free tier (~500 posts/mo — enough);
  auto-posting to an organization LinkedIn page requires Community Management API
  approval — apply early if the group wants it.

## 6. SEO and visibility

- Next.js SSR/ISR: all public pages are server-rendered.
- JSON-LD: `ScholarlyArticle` for publications, `Person` for profiles,
  `Organization` for the group.
- `sitemap.xml`, `robots.txt`, canonical URLs, OpenGraph tags.
- Analytics: Plausible (self-hosted, GDPR-friendly) or GA4 — decide with the supervisor.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Dirty publication data (duplicates, other people's namesakes) | match by ORCID/OpenAlex author ID, not by name; manual verification in the admin (`verified` field) |
| No LLM budget | Gemini free tier; batch generation; the site does not depend on the LLM |
| Payload 3 is unfamiliar to the team | it is "just a Next.js app"; the week-1 vertical slice de-risks it early |
| Deploying to the INESC server drags on | Docker Compose from day one; request server access as early as week 2 |
| Scope creep (the brief has many ideas) | core = brief section 6 deliverables; stretch only after week 5 |
