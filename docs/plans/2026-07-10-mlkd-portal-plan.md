# MLKD Portal — team work plan

Today: Thu 10 July 2026. MVP demo: **Thu 17 July**. Prototype target: end of August.
September is a buffer (polish, deploy, report). Internship deadline: end of September.

Roles (from the brief):
- **B** — Web Architecture & Backend Lead (Payload collections, schema, API, ingest)
- **F** — Frontend & UX Lead (design, pages, responsive)
- **A** — AI & Content Automation Lead (FastAPI, LiteLLM, embeddings, prompts)
- **D** — Data Integration & Visibility Lead (data cleaning, alumni, SEO, analytics)

---

## Sprint 1: MVP for the demo (10–17 July)

Demo scenario (5 minutes): open the site → publications are **real** → filter by
year/author → open a paper → AI summary (Summary/Problem/Method/Results/Takeaways)
→ go to `/admin` → edit a field → it updates on the site → add a new group member
in 30 seconds.

### Days 1–2 (Thu–Fri, 10–11 July) — foundation
- **B:** monorepo (`web/` + `ai/`), docker-compose (postgres+pgvector), initialize
  Payload 3 + Next.js, collections `users`, `members`, `publications` (fields from
  the design doc). Done when: `docker compose up` → admin opens, collections exist.
- **A:** FastAPI skeleton, `llm/client.py` with LiteLLM (model from `.env`), a smoke
  test of generation on the Gemini free tier. First prompt `summary.md`.
- **D:** gather input data: the list of group members, their ORCID/OpenAlex IDs (by
  name via openalex.org), verify by hand for 3–4 people that the API returns their
  real papers. Result: `data/authors.json`.
- **F:** design direction: 2–3 references (semanticscholar, other groups' sites),
  pick fonts/palette, lay out the Publications (list + card) and Member pages.

### Days 3–4 (Sat/Mon, 12–14 July) — data and pages
- **B + D:** `ingest.py`: OpenAlex from authors.json → dedupe by DOI → upsert into
  Payload via REST. Done when: the group's real publications show in the admin.
- **F:** pages: home (minimal), `/publications` (list, filters year/author/type),
  `/publications/[slug]`, `/people` + `/people/[slug]`.
- **A:** `summarize.py`: take publications without a summary → LLM → write to
  Payload. Run on 5–10 papers, review quality, tune the prompt.

### Days 5–6 (Tue–Wed, 15–16 July) — assembly and polish
- **B:** access roles (admin/editor), service key for FastAPI, seeds.
- **F:** show the AI summary on the publication page (a nice block, marked
  "AI-generated, edited by …"), responsive layout, polish.
- **A:** embeddings in pgvector + `GET /search` (if there is time, search makes the
  demo; if not, it moves to sprint 2 without drama).
- **D:** README (how to bring the project up), check the data for duplicates/junk.
- **Everyone:** run through the demo scenario, log bugs.

### Day 7 (Thu 17 July) — demo
In the morning, a final run on a clean machine (`git clone` → `docker compose up`).

---

## Sprints 2–7 (through end of August)

**Sprint 2 (18–25 July) — data and search.**
Full ingest (all members + DBLP cross-check), semantic search on the site,
Projects / Software / Research Themes pages, profile self-edit (a member logs in and
edits their own), collect supervisor feedback after the demo → adjust the plan.

**Sprint 3 (26 July – 1 Aug) — profiles and opportunities.**
AI bio drafts (pipeline + owner edits), alumni section with trajectories (D gathers
data), Thesis Topics + Opportunities section (CRUD in the admin), media/news section
+ "Generate social snippet" button + share to LinkedIn/X.

**Sprint 4 (2–8 Aug) — corpus summaries and SEO.**
Summarize the whole publication corpus (batch, quality review), "Blog mode" pages,
JSON-LD/sitemap/OG tags, analytics, sanity check in Google Search Console.

**Sprint 5 (9–15 Aug) — visualizations.**
Topic map (UMAP/HDBSCAN → interactive scatter/graph, react-force-graph), member
clustering "who works on similar topics", theme evolution over the years (if time
allows).

**Sprint 6 (16–22 Aug) — stretch.**
RAG chatbot over publications (`/chat`), auto-posting to X (free tier), newsletter
generator — in priority order, as far as we get.

**Sprint 7 (23–31 Aug) — deploy and handover.**
Deploy to the INESC-ID server (request access in sprint 2!), cron for the pipelines,
Postgres backups, maintenance proposal (document), an admin user guide, technical
report (draft).

**September — buffer:** feedback fixes, final report, presentation.

---

## Prioritized backlog (cross-checked against the brief, 11 July)

Result of a line-by-line cross-check of the plan against the supervisor's PDF.
Priority: P0 — before the demo, P1 — mandatory deliverables, P2 — strong pluses,
P3 — supervisor's call.

### P0 — before the demo 17.07
- [ ] **LLM key** from the supervisor or free Gemini (blocks real summaries)
- [ ] Audit of the current MLKD site (D; Technical Scope item 1; "before → after" slide)
- [ ] Mini mockups of 2–3 screens (F; "wireframes and mockups")
- [ ] Real summaries for 5–10 papers (A, after the key)
- [ ] "Related citations" block on the paper page (data already in the OpenAlex response)
- [ ] `/search` page on the site (backend ready, no UI)

### P1 — mandatory deliverables (sprints 2–4)
- [ ] Full ingest: OpenAlex IDs of all members + DBLP cross-check (needs team data)
- [ ] Bio pipeline `pipelines/bios.py` (deliverable "draft content for profiles")
- [ ] Industry and impact summaries: +2 fields in aiSummary and prompt sections (explicit supervisor request)
- [ ] Verify the member self-edit flow
- [ ] UI pages: thesis topics/opportunities, news + share buttons, projects, software, themes
- [ ] SEO: JSON-LD, sitemap, OG + analytics (Plausible/GA — ask the supervisor)
- [ ] Summarize the whole corpus + quality review

### P2 — strong pluses (sprint 5)
- [ ] Topic map + member clustering (member_embeddings already exist) + evolution over years
- [ ] Visualization of data/dataset types (tag field + chart)
- [ ] Cron auto-refresh of ingest/summarize/embed/cluster

### P3 — stretch / needs supervisor's decision
- [ ] Chatbot (RAG), newsletter, X auto-posting
- [ ] Nano Banana paper illustrations (ask Andre Duarte for the DeepMind paper)
- [ ] EURAXESS: API scouting → a "yes/no" answer
- [ ] Linking themes to companies, finding professors for Erasmus — mark as "beyond prototype"

---

## Working agreements

- Branches `feat/...`, PR + review by one teammate; main always comes up with
  `docker compose up`.
- Weekly checkpoint with the supervisor (progress demo, 15 minutes).
- Anything that needs LLM keys/budget — escalate to the supervisor immediately, not
  at the end.
- Priority on any schedule conflict: **core (brief deliverables) > stretch**.
