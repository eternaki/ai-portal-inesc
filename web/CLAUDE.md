# web/CLAUDE.md — Next.js + Payload CMS

Frontend + CMS for the MLKD portal. **Read the root `CLAUDE.md` first** (business,
architecture, global rules). This file covers only the `web/` specifics.

## Layout

- `src/collections/` — Payload collections (content types). One file per
  collection, each registered in `src/payload.config.ts`.
- `src/app/(frontend)/` — public site pages (App Router, Server Components).
- `src/app/(payload)/` — auto-generated Payload admin + REST/GraphQL API. **Do not
  hand-edit.**
- `src/app/api/` — Next.js route handlers (e.g. the proxy to the AI service).
- `src/components/` — shared React components (`JsonLd`, `PubRow`, `Scatter`, …).
- `src/fields/` — reusable Payload field builders (e.g. `slug.ts`).
- `src/hooks/` — Payload collection hooks (e.g. `autoProcessPublication.ts`, which
  triggers AI processing when a publication is saved).
- `src/access/` — access-control functions (see below).
- `src/lib/` — helpers (e.g. `site.ts`).
- `src/migrations/` — Payload DB migrations (prod runs these; dev uses schema push).
- `payload-types.ts` — **generated**, do not edit; run `pnpm generate:types`.

## Adding a collection (content type)

1. Create `src/collections/Xxx.ts` exporting a `CollectionConfig`.
2. Register it in `src/payload.config.ts` (`collections: [...]`).
3. Set `access` with helpers from `src/access` — don't inline role checks.
4. Reuse shared field builders from `src/fields/`; extract new shared fields there.
5. Run `pnpm generate:types`.
6. Add a public page under `src/app/(frontend)/` if it should be visible.
7. Run the CLAUDE.md sync checklist (root §7).

## Conventions

- **i18n: English + Português only** in every user-facing label and content field.
  Never Russian.
- **Access control lives in `src/access/index.ts`** — reuse `anyone`, `adminOnly`,
  `adminOrEditor`, `adminEditorOrSelf`, `adminOnlyField`. Roles: `admin` (all),
  `editor` (all content), `member` (own profile only, via `adminEditorOrSelf`).
- **Human edits win.** AI-written fields carry a status (e.g. `aiSummaryStatus`);
  never overwrite a value marked `edited`.
- **Editorial workflow.** Publications carry an editorial `status` (`editorialFields`
  in `src/fields/editorial.ts`); only `published` is public. Filter every public
  publication query with `PUBLISHED`/`published()` from `src/lib/queries.ts`, and
  use the `publishedOrPrivileged` read access. Status changes are logged by the
  `recordEditorialDecision` hook. Nothing auto-publishes — ingest/import make drafts.
- **Admin custom UI** lives in `src/components/admin/` (client components, referenced
  by `path#Export`): `ImportPublicationPanel` (DOI/URL/title import, on the
  Publications list), `MaintenancePanel` (data-health, on the dashboard) and
  `CoveragePanel` (publications per member vs the `knownPublicationCount` baseline
  and OpenAlex, on the dashboard). After adding one, run `pnpm generate:importmap`.
- **Member photos are imported, never scraped.** `pnpm photos:import` carries them
  over from the group's own legacy team page; LinkedIn is not a source (profiles are
  auth-walled — an anonymous fetch returns HTTP 999 — and scraping breaks their
  terms). People that page never listed have no photo anywhere we can reach, so they
  keep the initials avatar until someone uploads one — 55 of 114 currently do.
- **The initials avatar is coloured per person** (`src/lib/avatar-tone.mjs`, tones in
  `people.css`). One flat wash for everybody made a group read as the same broken
  image repeated, which is why `/people` used to drop low-coverage groups to a plain
  name list; with a stable colour each that fallback is gone and all 114 render as
  cards. The tone set is fixed rather than a hue hashed from the name so that
  `pnpm design:contrast` can check every pair in both themes — keep new tones in the
  stylesheet as explicit `color`/`background` pairs or the audit cannot see them.
- **On `members`, `role` is the degree and `membershipStatus` is whether they are
  still here.** Do not express "has left" by setting `role: alumni` — that erases
  which degree the person did, and `/people` groups by `membershipStatus` anyway
  (Active, subdivided by role; then Completed), so it buys nothing. Set
  `membershipStatus: 'completed'` and leave `role` alone. The `alumni` role value
  survives only on 12 records imported before this was clear. Statuses come from
  the group's own team page (`scripts/apply-legacy-status.mjs`), which is the only
  source that separates current students from graduated ones — the supervisor's MSc
  roster is everyone who ever did an MSc, in one alphabetical list.
- **Reading-group meetings are `events`.** There is no `reading-groups` collection:
  on the group's own site the Events page *is* the reading-group log — 83 meetings
  since March 2022, each a paper, its presenter and a link to it — so a second
  collection was the same content in two places. The archive was imported by
  `scripts/import-events.mjs` (`pnpm events:import` / `:apply`, matched on title +
  date because one paper was discussed twice), and the nav's *Reading Groups* entry
  links out to the Técnico page that schedules the sessions. The **page** structure
  still mirrors the legacy site, which the supervisor asked us to preserve.
- **`dissertations` covers the whole life of a thesis** (`open` → `ongoing` →
  `finished`); it is the collection formerly called `thesis-topics`. Open topics are
  a *stage*, not a separate section — `/opportunities` was removed because the two
  were the same content under two names. Supervisors and the author are stored as a
  name plus an optional member link (the `Publications.authors` pattern): only 17 of
  37 legacy names resolve to a member, and the attribution must render regardless.
- **`open-positions` stays separate from `dissertations`** even though both are
  "opportunities". They are different processes with a different person at the
  door: an open position is a paid research job (PhD contract, postdoc, junior
  researcher) with a degree-holding applicant, a Euraxess/HR application route and
  a hard deadline; a dissertation topic is picked by a student already enrolled at
  the university, from their supervisor, with no deadline. The legacy site keeps
  them apart for that reason — do not fold one into the other.
- **Public list pages must be exhaustively reachable.** Paginate (`page` search
  param) and build filter facets from the whole collection, not from the current
  page — a chip list that covers only part of the archive hides content with no
  way to reach it. See `src/app/(frontend)/publications/page.tsx`.
- **Feature flags** are in the `ai-settings` global (`features` group):
  `enableChatbot`, `enableSemanticSearch`, `enableSummaries`. The layout hides the
  chat widget when off; the AI service enforces the rest.
- **The chat answers without a language model.** `/chat` returns `mode:
  'llm' | 'extractive' | 'none'`; `extractive` means no model was available and the
  service sent the retrieved entries instead (see `ai/CLAUDE.md`). `ChatWidget`
  renders those as a list of things to open, under a note from the dictionary —
  **not** `data.answer`, which is the service's English plain-text rendering for
  direct API callers and would bypass i18n. Provider failures therefore no longer
  reach the widget as errors; don't reintroduce per-error-code copy for them.
- Public pages are **Server Components** by default (SSR/SEO). Emit structured data
  via `src/components/JsonLd.tsx`.
- Keep collection files focused; a growing file is a signal to split.

## Internationalization (i18n)

The public UI is bilingual **English + Português** (no Russian, ever). Approach:

- **Strings** live in `src/i18n/messages.ts` (`en` is the source of the `Dictionary`
  type; `pt` must define the same keys — TypeScript enforces it). Never hardcode a
  visible string in a page/component — add a key and use the dictionary.
- **Active locale** is a `NEXT_LOCALE` cookie, read per request by
  `getLocale()` / `getDictionary()` in `src/i18n/server.ts` (Server Components only).
- **Switcher**: `src/components/LocaleSwitcher.tsx` (client) sets the cookie and
  calls `router.refresh()`. It lives in the header (`layout.tsx`).
- In a page: `const t = await getDictionary()`, then `t.<area>.<key>`. For dates use
  `dateLocale[locale]` from `src/i18n/config.ts`.
- **Not translated**: bibliographic content from OpenAlex (titles, abstracts, author
  names) and static `<title>` metadata exports.
- Watch for shadowing: don't name a `.map()` item `t` — it hides the dictionary.

## Commands

- `pnpm dev` — dev server (http://localhost:3000, admin `/admin`)
- `pnpm generate:types` — regenerate `payload-types.ts` after collection changes
- `pnpm generate:importmap` — after adding custom admin components
- `pnpm lint` · `pnpm typecheck` · `pnpm scripts:test`
- **Tests live in `scripts/tests/*.test.mjs`** (`node --test`, no runner to
  configure) and cover the importers, matchers and parsers under `scripts/`, plus
  guards over source files that must agree with each other — see
  `scripts/lib/dissertation-order.mjs`. All three commands run in CI.
- `pnpm claude:map` — regenerate the Project map in the root CLAUDE.md
