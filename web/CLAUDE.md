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
  Publications list) and `MaintenancePanel` (data-health, on the dashboard). After
  adding one, run `pnpm generate:importmap`.
- **Feature flags** are in the `ai-settings` global (`features` group):
  `enableChatbot`, `enableSemanticSearch`, `enableSummaries`. The layout hides the
  chat widget when off; the AI service enforces the rest.
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
- `pnpm lint` · `pnpm typecheck`
- `pnpm claude:map` — regenerate the Project map in the root CLAUDE.md
