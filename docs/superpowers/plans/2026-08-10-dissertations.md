# Dissertations Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the portal the Dissertations section the group's legacy site has — 59 theses across three lifecycle stages — by renaming the existing `thesis-topics` collection, extending it, building list and detail pages, and importing the legacy content.

**Architecture:** `thesis-topics` is renamed to `dissertations` in place (it already models the same lifecycle and holds two rows) via two reversible SQL migrations. A dependency-free parser library turns the legacy site's machine-generated HTML into plain records; a thin importer script feeds those records to Payload's Local API through `payload run`, so no API key or direct SQL is involved. Pages follow the existing publications pattern: a paginated list plus a per-item detail page.

**Tech Stack:** Next.js 16 + Payload CMS 3 (TypeScript), PostgreSQL 16, `node --test` for the parser unit tests, `pnpm payload run` for the importer.

## Global Constraints

Copied from the root and `web/` CLAUDE.md — every task must honour these.

- **Site languages are English and Português only. No Russian may appear in the UI or in any user-facing content.** Every visible string goes through `web/src/i18n/messages.ts` and must be added to **both** `en` and `pt`. Never hardcode visible copy in a page or component.
- **Code, comments, docs and commit messages are in English.**
- **Comments explain what, why, and why this way** — the intent and the trade-off. If a comment restates the line below it, delete it.
- **Small, single-purpose files.** A large file is a smell; split when a file outgrows its one job.
- **Follow existing patterns before inventing new ones.** Match the surrounding code.
- Access control uses the helpers in `web/src/access/index.ts` (`anyone`, `adminOrEditor`, …) — never inline role checks in a collection.
- Public pages are **Server Components**.
- After any collection change run `pnpm generate:types`; after adding a custom admin component run `pnpm generate:importmap`.
- Public queries against editorially-gated collections use `PUBLISHED` / `published()` from `web/src/lib/queries.ts`. **Dissertations are not editorially gated** — they have no `status: published` field — so they need no such filter.
- Migrations are hand-written SQL in the style of `web/src/migrations/*.ts`, registered in `web/src/migrations/index.ts`, and must have a working `down`.
- Verification commands: `pnpm typecheck`, `pnpm lint`, `pnpm build`. `pnpm lint` currently reports **3 pre-existing errors** in `ThemeToggle.tsx` and `TopicMapChart.tsx` — those are not yours; your changes must not add more.

## Reference facts (measured 2026-08-10, do not re-derive)

Legacy pages and their shape:

| URL | Entries | Author | Fenix link |
|---|---|---|---|
| `https://mlkd.idss.inesc-id.pt/mlkd-dissertations-new.html` | 13 | no | no |
| `https://mlkd.idss.inesc-id.pt/mlkd-dissertations-ongoing.html` | 7 | yes | no |
| `https://mlkd.idss.inesc-id.pt/mlkd-dissertations-finished.html` | 39 | yes | yes |

Markup is identical across all three pages:

```html
<div class="thesis-topic-container1">
  <a href="FENIX_URL" target="_blank" rel="noreferrer noopener" class="thesis-topic-link">
    <span> TITLE </span>
  </a>
  <span class="thesis-topic-text"><span> ATTRIBUTION </span></span>
  <span class="thesis-topic-abstract"><span> DESCRIPTION_HTML </span></span>
</div>
```

- On `new` and `ongoing` the `<a class="thesis-topic-link">` has **no `href`**.
- The `new` page and the `finished` page each contain **one** entry whose classes are `thesis-topic-no-abstract-link` / `-text` / `-abstract` instead. Miss it and you silently import 38 of 39.
- `ATTRIBUTION` is `Supervised by A [and B] [and authored by X]`.
- `DESCRIPTION_HTML` contains real `<p>`, `<ol>`, `<li>` markup.

Existing DB schema of `thesis_topics` (target of the rename):

```
id, title, slug, level (enum_thesis_topics_level), status (enum_thesis_topics_status),
description jsonb, updated_at, created_at
indexes: pkey, created_at_idx, slug_idx (unique), status_idx, updated_at_idx
thesis_topics_rels(id, order, parent_id, path, members_id, research_themes_id)
payload_locked_documents_rels.thesis_topics_id
```

Lexical richText shape already stored in this database:

```json
{"root":{"type":"root","children":[{"type":"paragraph","children":[{"text":"...","type":"text"}]}]}}
```

## File Structure

**Create**
- `web/src/collections/Dissertations.ts` — the collection config (replaces `ThesisTopics.ts`)
- `web/src/migrations/20260811_100000_rename_thesis_topics_to_dissertations.ts`
- `web/src/migrations/20260811_110000_dissertation_fields.ts`
- `web/scripts/lib/dissertation-parser.mjs` — **pure functions only, no I/O, no network**
- `web/scripts/tests/dissertation-parser.test.mjs`
- `web/scripts/import-dissertations.mjs` — network + Local API, run via `pnpm payload run`
- `web/src/app/(frontend)/dissertations/page.tsx`
- `web/src/app/(frontend)/dissertations/[slug]/page.tsx`
- `web/src/components/DissertationRow.tsx`

**Modify**
- `web/src/payload.config.ts` — swap the import and the collections entry
- `web/src/migrations/index.ts` — register both migrations
- `web/src/i18n/messages.ts` — `dissertations` block + `nav.dissertations`, in `en` **and** `pt`
- `web/src/app/(frontend)/layout.tsx` — nav entry
- `web/src/app/sitemap.ts` — `/dissertations`
- `web/src/app/(frontend)/search/page.tsx` — entity type rename
- `web/src/app/api/health/admin/route.ts` — collection slug rename
- `web/package.json` — importer scripts
- `ai/app/entities.py` + `ai/tests/test_entities.py` — adapter slug rename
- `web/CLAUDE.md` — collection list note

**Delete**
- `web/src/collections/ThesisTopics.ts`
- `web/src/app/(frontend)/opportunities/page.tsx`

---

### Task 1: Rename the collection and remap its statuses

**Files:**
- Create: `web/src/collections/Dissertations.ts`
- Create: `web/src/migrations/20260811_100000_rename_thesis_topics_to_dissertations.ts`
- Modify: `web/src/migrations/index.ts`
- Modify: `web/src/payload.config.ts:16` (import), `:45` (collections array)
- Delete: `web/src/collections/ThesisTopics.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: collection slug `dissertations`; status enum values `open` | `ongoing` | `finished`; Payload type `Dissertation` in `web/src/payload-types.ts`.

- [ ] **Step 1: Create the renamed collection**

Create `web/src/collections/Dissertations.ts`. This is `ThesisTopics.ts` with the slug, labels, admin group and status values changed. Keep `level`, `advisors` and `themes` exactly as they are — Task 2 adds the new fields.

```ts
import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

// MSc and PhD theses at every stage of their life: open for application, being
// written, defended. One collection rather than three, because a topic does not
// change identity when a student takes it — only its status does.
export const Dissertations: CollectionConfig = {
  slug: 'dissertations',
  labels: { singular: 'Dissertation', plural: 'Dissertations' },
  admin: {
    useAsTitle: 'title',
    group: 'Dissertations',
    defaultColumns: ['title', 'level', 'status'],
  },
  access: {
    read: anyone,
    create: adminOrEditor,
    update: adminOrEditor,
    delete: adminOrEditor,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField('title'),
    {
      type: 'row',
      fields: [
        {
          name: 'level',
          type: 'select',
          required: true,
          options: [
            { label: 'MSc', value: 'msc' },
            { label: 'PhD', value: 'phd' },
          ],
          admin: { width: '50%' },
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'open',
          index: true,
          options: [
            { label: 'Open for application', value: 'open' },
            { label: 'Ongoing', value: 'ongoing' },
            { label: 'Finished', value: 'finished' },
          ],
          admin: { width: '50%' },
        },
      ],
    },
    { name: 'advisors', type: 'relationship', relationTo: 'members', hasMany: true },
    { name: 'description', type: 'richText' },
    { name: 'themes', type: 'relationship', relationTo: 'research-themes', hasMany: true },
  ],
}
```

- [ ] **Step 2: Delete the old collection file and rewire the config**

```bash
rm web/src/collections/ThesisTopics.ts
```

In `web/src/payload.config.ts` replace the import line

```ts
import { ThesisTopics } from './collections/ThesisTopics'
```

with

```ts
import { Dissertations } from './collections/Dissertations'
```

and in the `collections: [...]` array replace `ThesisTopics,` with `Dissertations,`.

- [ ] **Step 3: Write the migration**

Create `web/src/migrations/20260811_100000_rename_thesis_topics_to_dissertations.ts`.

Postgres renames the table's indexes and constraints implicitly only for some
objects, so rename them explicitly to keep the schema legible and to let a later
`migrate:down` find them by name.

```ts
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// `thesis-topics` always modelled the full life of a thesis, not just the open
// ones — the public page simply showed a third of it under the wrong name. The
// rename makes the collection say what it holds, and moves the status vocabulary
// to the one the group already uses on its own site (New / Ongoing / Finished).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "thesis_topics" RENAME TO "dissertations";
    ALTER TABLE "thesis_topics_rels" RENAME TO "dissertations_rels";
    ALTER SEQUENCE "thesis_topics_id_seq" RENAME TO "dissertations_id_seq";
    ALTER SEQUENCE "thesis_topics_rels_id_seq" RENAME TO "dissertations_rels_id_seq";

    ALTER INDEX "thesis_topics_pkey" RENAME TO "dissertations_pkey";
    ALTER INDEX "thesis_topics_slug_idx" RENAME TO "dissertations_slug_idx";
    ALTER INDEX "thesis_topics_status_idx" RENAME TO "dissertations_status_idx";
    ALTER INDEX "thesis_topics_created_at_idx" RENAME TO "dissertations_created_at_idx";
    ALTER INDEX "thesis_topics_updated_at_idx" RENAME TO "dissertations_updated_at_idx";
    ALTER INDEX "thesis_topics_rels_pkey" RENAME TO "dissertations_rels_pkey";
    ALTER INDEX "thesis_topics_rels_order_idx" RENAME TO "dissertations_rels_order_idx";
    ALTER INDEX "thesis_topics_rels_parent_idx" RENAME TO "dissertations_rels_parent_idx";
    ALTER INDEX "thesis_topics_rels_path_idx" RENAME TO "dissertations_rels_path_idx";
    ALTER INDEX "thesis_topics_rels_members_id_idx" RENAME TO "dissertations_rels_members_id_idx";
    ALTER INDEX "thesis_topics_rels_research_themes_id_idx" RENAME TO "dissertations_rels_research_themes_id_idx";

    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "thesis_topics_rels_parent_fk" TO "dissertations_rels_parent_fk";
    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "thesis_topics_rels_members_fk" TO "dissertations_rels_members_fk";
    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "thesis_topics_rels_research_themes_fk" TO "dissertations_rels_research_themes_fk";

    ALTER TYPE "enum_thesis_topics_level" RENAME TO "enum_dissertations_level";

    ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "thesis_topics_id" TO "dissertations_id";
    ALTER TABLE "payload_locked_documents_rels" RENAME CONSTRAINT "payload_locked_documents_rels_thesis_topics_fk" TO "payload_locked_documents_rels_dissertations_fk";
    ALTER INDEX IF EXISTS "payload_locked_documents_rels_thesis_topics_id_idx" RENAME TO "payload_locked_documents_rels_dissertations_id_idx";
  `)

  // The status enum gains two labels and loses two. Postgres cannot drop enum
  // values, so build the new type and swap the column over it.
  await db.execute(sql`
    CREATE TYPE "enum_dissertations_status" AS ENUM('open', 'ongoing', 'finished');

    ALTER TABLE "dissertations" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "dissertations" ALTER COLUMN "status" TYPE "enum_dissertations_status"
      USING (
        CASE "status"::text
          WHEN 'assigned' THEN 'ongoing'
          WHEN 'completed' THEN 'finished'
          ELSE 'open'
        END
      )::"enum_dissertations_status";
    ALTER TABLE "dissertations" ALTER COLUMN "status" SET DEFAULT 'open'::"enum_dissertations_status";

    DROP TYPE "enum_thesis_topics_status";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "enum_thesis_topics_status" AS ENUM('open', 'assigned', 'completed');

    ALTER TABLE "dissertations" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "dissertations" ALTER COLUMN "status" TYPE "enum_thesis_topics_status"
      USING (
        CASE "status"::text
          WHEN 'ongoing' THEN 'assigned'
          WHEN 'finished' THEN 'completed'
          ELSE 'open'
        END
      )::"enum_thesis_topics_status";
    ALTER TABLE "dissertations" ALTER COLUMN "status" SET DEFAULT 'open'::"enum_thesis_topics_status";

    DROP TYPE "enum_dissertations_status";
  `)

  await db.execute(sql`
    ALTER INDEX IF EXISTS "payload_locked_documents_rels_dissertations_id_idx" RENAME TO "payload_locked_documents_rels_thesis_topics_id_idx";
    ALTER TABLE "payload_locked_documents_rels" RENAME CONSTRAINT "payload_locked_documents_rels_dissertations_fk" TO "payload_locked_documents_rels_thesis_topics_fk";
    ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "dissertations_id" TO "thesis_topics_id";

    ALTER TYPE "enum_dissertations_level" RENAME TO "enum_thesis_topics_level";

    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "dissertations_rels_research_themes_fk" TO "thesis_topics_rels_research_themes_fk";
    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "dissertations_rels_members_fk" TO "thesis_topics_rels_members_fk";
    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "dissertations_rels_parent_fk" TO "thesis_topics_rels_parent_fk";

    ALTER INDEX "dissertations_rels_research_themes_id_idx" RENAME TO "thesis_topics_rels_research_themes_id_idx";
    ALTER INDEX "dissertations_rels_members_id_idx" RENAME TO "thesis_topics_rels_members_id_idx";
    ALTER INDEX "dissertations_rels_path_idx" RENAME TO "thesis_topics_rels_path_idx";
    ALTER INDEX "dissertations_rels_parent_idx" RENAME TO "thesis_topics_rels_parent_idx";
    ALTER INDEX "dissertations_rels_order_idx" RENAME TO "thesis_topics_rels_order_idx";
    ALTER INDEX "dissertations_rels_pkey" RENAME TO "thesis_topics_rels_pkey";
    ALTER INDEX "dissertations_updated_at_idx" RENAME TO "thesis_topics_updated_at_idx";
    ALTER INDEX "dissertations_created_at_idx" RENAME TO "thesis_topics_created_at_idx";
    ALTER INDEX "dissertations_status_idx" RENAME TO "thesis_topics_status_idx";
    ALTER INDEX "dissertations_slug_idx" RENAME TO "thesis_topics_slug_idx";
    ALTER INDEX "dissertations_pkey" RENAME TO "thesis_topics_pkey";

    ALTER SEQUENCE "dissertations_rels_id_seq" RENAME TO "thesis_topics_rels_id_seq";
    ALTER SEQUENCE "dissertations_id_seq" RENAME TO "thesis_topics_id_seq";
    ALTER TABLE "dissertations_rels" RENAME TO "thesis_topics_rels";
    ALTER TABLE "dissertations" RENAME TO "thesis_topics";
  `)
}
```

- [ ] **Step 4: Register the migration**

In `web/src/migrations/index.ts` add the import beside the others:

```ts
import * as migration_20260811_100000_rename_thesis_topics_to_dissertations from './20260811_100000_rename_thesis_topics_to_dissertations';
```

and append to the `migrations` array:

```ts
  {
    up: migration_20260811_100000_rename_thesis_topics_to_dissertations.up,
    down: migration_20260811_100000_rename_thesis_topics_to_dissertations.down,
    name: '20260811_100000_rename_thesis_topics_to_dissertations'
  },
```

- [ ] **Step 5: Run the migration up and verify**

```bash
cd web && pnpm payload migrate
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "select id, title, status from dissertations;" -c "\dt dissertations*"
```

Expected: 2 rows with `status = open`; tables `dissertations` and `dissertations_rels` present, no `thesis_topics*`.

- [ ] **Step 6: Verify the migration is reversible, then re-apply**

```bash
cd web && pnpm payload migrate:down
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "select id, title, status from thesis_topics;"
pnpm payload migrate
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "select id, title, status from dissertations;"
```

Expected: after `migrate:down` the 2 rows are in `thesis_topics` with `status = open`; after `migrate` they are back in `dissertations`. **If `migrate:down` errors, fix the `down` function before continuing — a migration you cannot reverse is not done.**

- [ ] **Step 7: Regenerate types and typecheck**

```bash
cd web && pnpm generate:types && pnpm typecheck
```

Expected: `pnpm typecheck` reports errors in the files that still reference the old slug (`search/page.tsx`, `api/health/admin/route.ts`, `opportunities/page.tsx`, `page.tsx`). That is expected at this point — Task 7 removes and rewires them. Do **not** fix them here; note them and move on.

- [ ] **Step 8: Commit**

```bash
git add web/src/collections/Dissertations.ts web/src/migrations/ web/src/payload.config.ts web/src/payload-types.ts
git rm web/src/collections/ThesisTopics.ts
git commit -m "refactor(web): rename thesis-topics to dissertations

The collection always modelled a thesis at every stage; only a third of it was
ever shown, under a name that described the page rather than the content. Status
values move to the group's own vocabulary: open / ongoing / finished."
```

---

### Task 2: Add the dissertation fields

**Files:**
- Modify: `web/src/collections/Dissertations.ts`
- Create: `web/src/migrations/20260811_110000_dissertation_fields.ts`
- Modify: `web/src/migrations/index.ts`

**Interfaces:**
- Consumes: collection `dissertations` from Task 1.
- Produces: fields `supervisors` (array of `{ name: string; member?: number | Member }`), `author` (group `{ name?: string; member?: number | Member }`), `requisites` (richText), `fenixUrl` (text), `sourceUrl` (text). Table `dissertations_supervisors`.

- [ ] **Step 1: Add the fields to the collection**

In `web/src/collections/Dissertations.ts`, replace the `advisors` field with `supervisors` and add the rest. The full `fields` array becomes:

```ts
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField('title'),
    {
      type: 'row',
      fields: [
        {
          name: 'level',
          type: 'select',
          required: true,
          options: [
            { label: 'MSc', value: 'msc' },
            { label: 'PhD', value: 'phd' },
          ],
          admin: { width: '50%' },
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'open',
          index: true,
          options: [
            { label: 'Open for application', value: 'open' },
            { label: 'Ongoing', value: 'ongoing' },
            { label: 'Finished', value: 'finished' },
          ],
          admin: { width: '50%' },
        },
      ],
    },
    {
      // Same shape as Publications.authors: the name is the fact and always
      // renders; the member link is a bonus when we can resolve the person. Of 37
      // legacy authors only 17 match a member, so a bare relationship would drop
      // the attribution on the other 20.
      name: 'supervisors',
      type: 'array',
      labels: { singular: 'Supervisor', plural: 'Supervisors' },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'member', type: 'relationship', relationTo: 'members' },
      ],
    },
    {
      name: 'author',
      type: 'group',
      admin: { description: 'The student writing or having written the thesis. Empty while the topic is open.' },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'member', type: 'relationship', relationTo: 'members' },
      ],
    },
    { name: 'description', type: 'richText' },
    {
      name: 'requisites',
      type: 'richText',
      admin: { description: 'What a student needs to apply. Shown as its own block on the page.' },
    },
    {
      name: 'fenixUrl',
      type: 'text',
      admin: { description: 'Link to the defended thesis in the Fenix repository.' },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Legacy page this record was imported from. Set by the importer.',
      },
    },
    { name: 'themes', type: 'relationship', relationTo: 'research-themes', hasMany: true },
  ],
```

Note the `advisors` relationship is **replaced**, not kept — the two existing rows have no advisors (`thesis_topics_rels` holds only `themes` paths for them), so nothing is lost.

- [ ] **Step 2: Write the migration**

Create `web/src/migrations/20260811_110000_dissertation_fields.ts`:

```ts
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Fields the legacy site carries that this collection never had: who supervised,
// who wrote it, what a student needs to apply, and where the defended thesis lives.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "author_name" varchar;
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "author_member_id" integer;
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "requisites" jsonb;
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "fenix_url" varchar;
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "source_url" varchar;

    DO $$ BEGIN
      ALTER TABLE "dissertations" ADD CONSTRAINT "dissertations_author_member_id_members_id_fk"
        FOREIGN KEY ("author_member_id") REFERENCES "members"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "dissertations_author_member_idx" ON "dissertations" ("author_member_id");

    CREATE TABLE IF NOT EXISTS "dissertations_supervisors" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "member_id" integer
    );
    DO $$ BEGIN
      ALTER TABLE "dissertations_supervisors" ADD CONSTRAINT "dissertations_supervisors_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "dissertations"("id") ON DELETE cascade;
      ALTER TABLE "dissertations_supervisors" ADD CONSTRAINT "dissertations_supervisors_member_id_members_id_fk"
        FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "dissertations_supervisors_order_idx" ON "dissertations_supervisors" ("_order");
    CREATE INDEX IF NOT EXISTS "dissertations_supervisors_parent_id_idx" ON "dissertations_supervisors" ("_parent_id");
    CREATE INDEX IF NOT EXISTS "dissertations_supervisors_member_idx" ON "dissertations_supervisors" ("member_id");

    DELETE FROM "dissertations_rels" WHERE "path" = 'advisors';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "dissertations_supervisors" CASCADE;
    DROP INDEX IF EXISTS "dissertations_author_member_idx";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "source_url";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "fenix_url";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "requisites";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "author_member_id";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "author_name";
  `)
}
```

- [ ] **Step 3: Register the migration**

Same shape as Task 1 Step 4, for `20260811_110000_dissertation_fields`.

- [ ] **Step 4: Run, verify, reverse, re-apply**

```bash
cd web && pnpm payload migrate
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "\d dissertations" -c "\d dissertations_supervisors"
pnpm payload migrate:down && pnpm payload migrate
```

Expected: columns `author_name`, `author_member_id`, `requisites`, `fenix_url`, `source_url` present; table `dissertations_supervisors` present; down and up both succeed.

- [ ] **Step 5: Verify Payload agrees with the schema**

```bash
cd web && pnpm generate:types && pnpm typecheck 2>&1 | head -20
```

Then start the dev server and open `http://localhost:3000/admin/collections/dissertations` — the form must show Supervisors, Author, Requisites and Fenix URL. A schema mismatch surfaces here as a runtime error, which is why this step is manual.

- [ ] **Step 6: Commit**

```bash
git add web/src/collections/Dissertations.ts web/src/migrations/ web/src/payload-types.ts
git commit -m "feat(web): add supervisor, author, requisites and Fenix fields to dissertations"
```

---

### Task 3: The legacy HTML parser (pure library, TDD)

**Files:**
- Create: `web/scripts/lib/dissertation-parser.mjs`
- Test: `web/scripts/tests/dissertation-parser.test.mjs`
- Modify: `web/package.json` (test script)

**Interfaces:**
- Consumes: nothing. **This module must not import `node:fs`, `node:http` or Payload.** It takes HTML strings and returns plain objects, which is what makes it testable.
- Produces:
  - `parseAttribution(text) → { supervisors: string[], author: string | null }`
  - `htmlToLexical(html) → object` (Payload Lexical richText value)
  - `parseDissertationPage(html, { status, sourceUrl }) → Array<ParsedDissertation>`
  - `ParsedDissertation = { title, status, supervisors: string[], author: string|null, description: object|null, requisites: object|null, fenixUrl: string|null, sourceUrl: string }`

- [ ] **Step 1: Write the failing tests**

Create `web/scripts/tests/dissertation-parser.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  htmlToLexical,
  parseAttribution,
  parseDissertationPage,
} from '../lib/dissertation-parser.mjs'

test('parseAttribution reads a single supervisor and no author', () => {
  const r = parseAttribution('Supervised by Arlindo L. Oliveira')
  assert.deepEqual(r, { supervisors: ['Arlindo L. Oliveira'], author: null })
})

test('parseAttribution reads two supervisors and an author', () => {
  const r = parseAttribution('Supervised by Arlindo L. Oliveira and Bruno Martins and authored by João Marques Cardoso')
  assert.deepEqual(r, {
    supervisors: ['Arlindo L. Oliveira', 'Bruno Martins'],
    author: 'João Marques Cardoso',
  })
})

test('parseAttribution tolerates the "authored by" spelling without a leading and', () => {
  const r = parseAttribution('Supervised by Arlindo L. Oliveira and Fernando Silva authored by José Velez')
  assert.deepEqual(r, {
    supervisors: ['Arlindo L. Oliveira', 'Fernando Silva'],
    author: 'José Velez',
  })
})

test('parseAttribution returns empty on unrecognised text rather than guessing', () => {
  assert.deepEqual(parseAttribution('nonsense'), { supervisors: [], author: null })
})

test('htmlToLexical turns paragraphs into paragraph nodes', () => {
  const out = htmlToLexical('First para.<p>Second para.</p>')
  assert.equal(out.root.type, 'root')
  assert.equal(out.root.children.length, 2)
  assert.equal(out.root.children[0].children[0].text, 'First para.')
  assert.equal(out.root.children[1].children[0].text, 'Second para.')
})

test('htmlToLexical numbers ordered list items and keeps their text', () => {
  const out = htmlToLexical('<ol><li>Use CLIP.</li><li>Use LayoutLM.</li></ol>')
  assert.equal(out.root.children.length, 2)
  assert.equal(out.root.children[0].children[0].text, '1. Use CLIP.')
  assert.equal(out.root.children[1].children[0].text, '2. Use LayoutLM.')
})

test('htmlToLexical decodes entities and drops empty blocks', () => {
  const out = htmlToLexical('<p>A &amp; B</p><p>  </p>')
  assert.equal(out.root.children.length, 1)
  assert.equal(out.root.children[0].children[0].text, 'A & B')
})

test('htmlToLexical returns null for empty input', () => {
  assert.equal(htmlToLexical(''), null)
  assert.equal(htmlToLexical('   '), null)
})

const FINISHED_HTML = `
<div class="thesis-topic-container1">
  <a href="https://fenix.tecnico.ulisboa.pt/x/1" class="thesis-topic-link"><span> Stroke Segmentation </span></a>
  <span class="thesis-topic-text"><span> Supervised by Arlindo L. Oliveira and authored by João Teixeira </span></span>
  <span class="thesis-topic-abstract"><span> Stroke is a leading cause of death. </span></span>
</div>
<div class="thesis-topic-no-abstract-container1">
  <a href="https://fenix.tecnico.ulisboa.pt/x/2" class="thesis-topic-no-abstract-link"><span> Untitled Work </span></a>
  <span class="thesis-topic-no-abstract-text"><span> Supervised by Bruno Martins and authored by Ana Alves </span></span>
</div>`

test('parseDissertationPage reads both the normal and the no-abstract variant', () => {
  const rows = parseDissertationPage(FINISHED_HTML, {
    status: 'finished',
    sourceUrl: 'https://example.test/finished',
  })
  assert.equal(rows.length, 2)

  assert.equal(rows[0].title, 'Stroke Segmentation')
  assert.equal(rows[0].status, 'finished')
  assert.deepEqual(rows[0].supervisors, ['Arlindo L. Oliveira'])
  assert.equal(rows[0].author, 'João Teixeira')
  assert.equal(rows[0].fenixUrl, 'https://fenix.tecnico.ulisboa.pt/x/1')
  assert.equal(rows[0].description.root.children[0].children[0].text, 'Stroke is a leading cause of death.')
  assert.equal(rows[0].sourceUrl, 'https://example.test/finished')

  assert.equal(rows[1].title, 'Untitled Work')
  assert.equal(rows[1].author, 'Ana Alves')
  assert.equal(rows[1].description, null)
})

test('parseDissertationPage leaves fenixUrl null when the anchor has no href', () => {
  const html = `
    <div class="thesis-topic-container1">
      <a class="thesis-topic-link"><span> Open Topic </span></a>
      <span class="thesis-topic-text"><span> Supervised by Arlindo L. Oliveira </span></span>
      <span class="thesis-topic-abstract"><span> Some description. Requisites: knows PyTorch. </span></span>
    </div>`
  const rows = parseDissertationPage(html, { status: 'open', sourceUrl: 'https://example.test/new' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].fenixUrl, null)
  assert.equal(rows[0].author, null)
})

test('parseDissertationPage splits a Requisites sentence into its own field', () => {
  const html = `
    <div class="thesis-topic-container1">
      <a class="thesis-topic-link"><span> Open Topic </span></a>
      <span class="thesis-topic-text"><span> Supervised by Arlindo L. Oliveira </span></span>
      <span class="thesis-topic-abstract"><span> <p>Study embeddings.</p><p>Requisites: The student should know PyTorch.</p> </span></span>
    </div>`
  const rows = parseDissertationPage(html, { status: 'open', sourceUrl: 'https://example.test/new' })
  assert.equal(rows[0].description.root.children[0].children[0].text, 'Study embeddings.')
  assert.equal(rows[0].requisites.root.children[0].children[0].text, 'The student should know PyTorch.')
})
```

- [ ] **Step 2: Run the tests to watch them fail**

```bash
cd web && node --test scripts/tests/dissertation-parser.test.mjs
```

Expected: FAIL — `Cannot find module '../lib/dissertation-parser.mjs'`.

- [ ] **Step 3: Implement the parser**

Create `web/scripts/lib/dissertation-parser.mjs`.

The legacy site is generated by a page builder, so its markup is uniform: identical class names on all three pages, one element per field. That uniformity is why a regex reader is adequate here and why no HTML-parser dependency is added — the two sibling importers in this folder are dependency-free too. The risk of regex parsing is silent under-matching, which Task 4 defends against with an expected-count assertion.

```js
// Reader for the group's legacy dissertation pages (mlkd.idss.inesc-id.pt).
// Pure: HTML in, plain objects out — no network, no filesystem, no Payload — so
// every rule below is unit-testable without touching the live site.
//
// The source is builder-generated and uniform: each entry is one
// .thesis-topic-container1 holding a link (title + optional Fenix href), an
// attribution line, and an optional abstract. One finished entry uses
// .thesis-topic-no-abstract-* class names instead; both spellings are read here,
// because missing the variant would silently drop a record.

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

function decodeEntities(s) {
  return s
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function textOf(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function paragraphNode(text) {
  return {
    type: 'paragraph',
    children: [{ type: 'text', text }],
  }
}

/**
 * Convert an abstract's inner HTML to a Payload Lexical value.
 *
 * Only paragraphs are emitted. List items become numbered or bulleted
 * paragraphs rather than Lexical list nodes: the list node shape is an internal
 * Payload detail, and a wrong guess would break the admin editor for every
 * imported record. Text and reading order survive, which is what matters here.
 * Returns null for empty input so the caller can leave the field unset.
 */
export function htmlToLexical(html) {
  if (!html || !html.trim()) return null

  // Turn list items into marker-prefixed paragraphs in place, so a list keeps its
  // position in the reading order. Collecting them separately would hoist every
  // list above the prose that introduces it.
  const withLists = html.replace(/<(ol|ul)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, inner) => {
    const ordered = tag.toLowerCase() === 'ol'
    let n = 0
    const lines = []
    for (const item of inner.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) ?? []) {
      const text = textOf(item)
      if (!text) continue
      n += 1
      lines.push(ordered ? `${n}. ${text}` : `\u2022 ${text}`)
    }
    return lines.map((line) => `<p>${line}</p>`).join('')
  })

  // Split on the opening tag as well as the closing one: the source opens its
  // abstracts with bare prose before the first <p>, so splitting on </p> alone
  // would glue that first sentence onto the paragraph after it.
  const children = withLists
    .split(/<\/?p\b[^>]*>|<br\s*\/?>/gi)
    .map(textOf)
    .filter(Boolean)
    .map(paragraphNode)

  if (children.length === 0) return null
  return { root: { type: 'root', children } }
}

/**
 * Read "Supervised by A [and B] [and] authored by X".
 *
 * Split on the author marker first: supervisors are joined by " and ", so
 * splitting on " and " up front would swallow the author into the list. Returns
 * empty values on anything unrecognised — inventing a supervisor is worse than
 * importing a record without one, and Task 4's report surfaces the blanks.
 */
export function parseAttribution(text) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  const match = clean.match(/^Supervised by\s+(.*?)(?:\s+and)?\s+authored by\s+(.+)$/i)
  const supervisorPart = match ? match[1] : clean.replace(/^Supervised by\s+/i, '')
  const author = match ? match[2].trim() : null

  if (!/^Supervised by/i.test(clean)) return { supervisors: [], author: null }

  const supervisors = supervisorPart
    .split(/\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)

  return { supervisors, author }
}

// "Requisites:" opens the block that tells a student whether they can apply. It
// is present in every open topic, so it earns its own field; "Notes" and
// "External cooperation" appear in about half and stay inside the description.
const REQUISITES_RE = /^requisites\s*:?\s*/i

function splitRequisites(lexical) {
  if (!lexical) return { description: null, requisites: null }

  const description = []
  const requisites = []
  let inRequisites = false

  for (const node of lexical.root.children) {
    const text = node.children[0]?.text ?? ''
    if (REQUISITES_RE.test(text)) {
      inRequisites = true
      const stripped = text.replace(REQUISITES_RE, '').trim()
      if (stripped) requisites.push(paragraphNode(stripped))
      continue
    }
    ;(inRequisites ? requisites : description).push(node)
  }

  return {
    description: description.length ? { root: { type: 'root', children: description } } : null,
    requisites: requisites.length ? { root: { type: 'root', children: requisites } } : null,
  }
}

const ENTRY_RE =
  /<a\b([^>]*class="thesis-topic(?:-no-abstract)?-link"[^>]*)>\s*<span>([\s\S]*?)<\/span>\s*<\/a>\s*<span class="thesis-topic(?:-no-abstract)?-text">\s*<span>([\s\S]*?)<\/span>\s*<\/span>(?:\s*<span class="thesis-topic(?:-no-abstract)?-abstract">\s*<span>([\s\S]*?)<\/span>)?/gi

/**
 * Read every dissertation on one legacy page.
 * `status` is the stage that page represents; `sourceUrl` is recorded on each
 * record so a re-import can tell where a row came from.
 */
export function parseDissertationPage(html, { status, sourceUrl }) {
  const rows = []
  for (const m of html.matchAll(ENTRY_RE)) {
    const [, anchorAttrs, titleHtml, attributionHtml, abstractHtml] = m
    const title = textOf(titleHtml)
    if (!title) continue

    const hrefMatch = anchorAttrs.match(/href="([^"]+)"/i)
    const { supervisors, author } = parseAttribution(textOf(attributionHtml))
    const { description, requisites } = splitRequisites(htmlToLexical(abstractHtml ?? ''))

    rows.push({
      title,
      status,
      supervisors,
      author,
      description,
      requisites,
      fenixUrl: hrefMatch ? hrefMatch[1] : null,
      sourceUrl,
    })
  }
  return rows
}
```

- [ ] **Step 4: Run the tests until they pass**

```bash
cd web && node --test scripts/tests/dissertation-parser.test.mjs
```

Expected: all tests pass. If `parseAttribution` fails the "without a leading and" case, check that the `(?:\s+and)?` group is optional; if `htmlToLexical` merges two paragraphs into one, check that the split regex covers the opening `<p>` tag and not only the closing one.

- [ ] **Step 5: Add the test script**

In `web/package.json`, beside the other `*:test` entries:

```json
    "dissertations:parser:test": "node --test scripts/tests/dissertation-parser.test.mjs",
```

- [ ] **Step 6: Commit**

```bash
git add web/scripts/lib/dissertation-parser.mjs web/scripts/tests/dissertation-parser.test.mjs web/package.json
git commit -m "feat(web): add a parser for the legacy dissertation pages

Pure HTML-in/objects-out so the parsing rules are unit-tested without the live
site. Reads both the normal and the no-abstract entry variant, because the
finished page contains one of the latter."
```

---

### Task 4: The importer script

**Files:**
- Create: `web/scripts/import-dissertations.mjs`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `parseDissertationPage` from Task 3; the `dissertations` collection from Tasks 1–2; `normalizeName` and `firstLastKey` from `web/scripts/lib/member-importer.mjs`.
- Produces: `web/reports/dissertations-import-{dry-run,apply}.json`; npm scripts `dissertations:import` and `dissertations:import:apply`.

- [ ] **Step 1: Confirm the helpers you are reusing**

```bash
cd web && grep -n "^export function normalizeName\|^export function firstLastKey" scripts/lib/member-importer.mjs
```

Expected: both exist. Reuse them rather than writing new name normalisation — they already strip accents and handle `Arlindo L. Oliveira` → `arlindo oliveira`, which is exactly the mismatch this importer hits.

- [ ] **Step 2: Write the importer**

Create `web/scripts/import-dissertations.mjs`:

```js
/**
 * Import the group's dissertations from its legacy site into Payload.
 *
 * Run:  pnpm dissertations:import          (dry run, writes a report)
 *       pnpm dissertations:import:apply    (writes to the database)
 *
 * Writes through Payload's Local API via `payload run`, so arrays, relationships
 * and richText are built by Payload itself — no SQL, and no API key needed.
 *
 * Idempotent: an existing record is matched on fenixUrl first, then on a
 * normalised title, and updated rather than duplicated.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import { parseDissertationPage } from './lib/dissertation-parser.mjs'
import { firstLastKey, normalizeName } from './lib/member-importer.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const BASE = 'https://mlkd.idss.inesc-id.pt'

// Expected counts, measured 2026-08-10. The parser reads generated markup with
// regexes, so its failure mode is silent under-matching. Asserting the counts
// turns "the site was redesigned" into a loud error instead of an import that
// quietly drops half the archive.
const PAGES = [
  { url: `${BASE}/mlkd-dissertations-new.html`, status: 'open', expected: 13 },
  { url: `${BASE}/mlkd-dissertations-ongoing.html`, status: 'ongoing', expected: 7 },
  { url: `${BASE}/mlkd-dissertations-finished.html`, status: 'finished', expected: 39 },
]

const apply = process.argv.includes('--apply')

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'mlkd-portal-importer' } })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.text()
}

function buildMemberIndex(members) {
  const byExact = new Map()
  const byFirstLast = new Map()
  for (const m of members) {
    byExact.set(normalizeName(m.name), m.id)
    const key = firstLastKey(m.name)
    // A first+last key can collide; keep the first and let the report show the
    // name as unresolved rather than linking the wrong person.
    if (key && !byFirstLast.has(key)) byFirstLast.set(key, m.id)
  }
  return { byExact, byFirstLast }
}

function resolveMember(name, index) {
  if (!name) return null
  return index.byExact.get(normalizeName(name)) ?? index.byFirstLast.get(firstLastKey(name)) ?? null
}

async function run() {
  const payload = await getPayload({ config })

  const parsed = []
  for (const page of PAGES) {
    const html = await fetchPage(page.url)
    const rows = parseDissertationPage(html, { status: page.status, sourceUrl: page.url })
    if (rows.length !== page.expected) {
      throw new Error(
        `${page.url}: parsed ${rows.length} entries, expected ${page.expected}. ` +
          `The legacy markup probably changed — fix the parser before importing.`,
      )
    }
    parsed.push(...rows)
  }

  const members = await payload.find({ collection: 'members', limit: 1000, depth: 0 })
  const index = buildMemberIndex(members.docs)

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    parsed: parsed.length,
    created: [],
    updated: [],
    unresolvedPeople: [],
    errors: [],
  }

  for (const row of parsed) {
    const supervisors = row.supervisors.map((name) => {
      const member = resolveMember(name, index)
      if (!member) report.unresolvedPeople.push({ role: 'supervisor', name, title: row.title })
      return member ? { name, member } : { name }
    })

    const authorMember = resolveMember(row.author, index)
    if (row.author && !authorMember) {
      report.unresolvedPeople.push({ role: 'author', name: row.author, title: row.title })
    }

    const data = {
      title: row.title,
      status: row.status,
      level: 'msc', // legacy pages are all MEIC theses; PhD entries are added by hand
      supervisors,
      author: row.author ? { name: row.author, ...(authorMember ? { member: authorMember } : {}) } : {},
      ...(row.description ? { description: row.description } : {}),
      ...(row.requisites ? { requisites: row.requisites } : {}),
      ...(row.fenixUrl ? { fenixUrl: row.fenixUrl } : {}),
      sourceUrl: row.sourceUrl,
    }

    const where = row.fenixUrl
      ? { fenixUrl: { equals: row.fenixUrl } }
      : { title: { equals: row.title } }
    const existing = await payload.find({ collection: 'dissertations', where, limit: 1, depth: 0 })
    const found = existing.docs[0]

    try {
      if (found) {
        if (apply) await payload.update({ collection: 'dissertations', id: found.id, data })
        report.updated.push({ id: found.id, title: row.title })
      } else {
        if (apply) await payload.create({ collection: 'dissertations', data })
        report.created.push({ title: row.title, status: row.status })
      }
    } catch (err) {
      report.errors.push({ title: row.title, message: String(err?.message ?? err) })
    }
  }

  const reportPath = path.join(repoRoot, 'reports', `dissertations-import-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: parsed ${report.parsed}, created ${report.created.length}, ` +
      `updated ${report.updated.length}, unresolved people ${report.unresolvedPeople.length}, ` +
      `errors ${report.errors.length}`,
  )
  console.log(`report → ${reportPath}`)
}

await run()
```

- [ ] **Step 3: Add the npm scripts**

In `web/package.json`:

```json
    "dissertations:import": "cross-env NODE_OPTIONS=--no-deprecation payload run scripts/import-dissertations.mjs",
    "dissertations:import:apply": "cross-env NODE_OPTIONS=--no-deprecation payload run scripts/import-dissertations.mjs --apply",
```

- [ ] **Step 4: Dry run**

```bash
cd web && pnpm dissertations:import
```

Expected: `dry-run: parsed 59, created 59, updated 0, …`. If it throws the count assertion, the legacy markup changed — fix the parser and its tests, do not weaken the assertion.

Read `web/reports/dissertations-import-dry-run.json` and sanity-check three records against the live pages.

- [ ] **Step 5: Apply and verify**

```bash
cd web && pnpm dissertations:import:apply
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd \
  -c "select status, count(*) from dissertations group by 1;" \
  -c "select count(*) from dissertations_supervisors;" \
  -c "select count(*) from dissertations where author_name is not null;"
```

Expected: `open 15` (13 imported + the 2 pre-existing rows), `ongoing 7`, `finished 39`; supervisors and authors populated.

- [ ] **Step 6: Verify the import is idempotent**

```bash
cd web && pnpm dissertations:import:apply
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "select count(*) from dissertations;"
```

Expected: still 61 rows, report shows `created 0, updated 59`. **If the count grew, the matching is broken — fix it before committing.**

- [ ] **Step 7: Commit**

```bash
git add web/scripts/import-dissertations.mjs web/package.json web/reports/
git commit -m "feat(web): import dissertations from the legacy site

Writes through Payload's Local API under \`payload run\`, so relationships and
richText are built by Payload. Asserts the per-page entry counts: the parser
reads generated markup, and its failure mode is silently importing fewer records
than exist."
```

---

### Task 5: The list page

**Files:**
- Create: `web/src/app/(frontend)/dissertations/page.tsx`
- Create: `web/src/components/DissertationRow.tsx`
- Modify: `web/src/i18n/messages.ts`

**Interfaces:**
- Consumes: collection `dissertations`; type `Dissertation` from `web/src/payload-types.ts`.
- Produces: route `/dissertations` accepting `?status=`, `?level=`, `?page=`; component `DissertationRow`.

- [ ] **Step 1: Add the dictionary entries**

In `web/src/i18n/messages.ts`, add to the **`en`** object (place it after the `publications` block) and add `dissertations: 'Dissertations'` to `en.nav`:

```ts
  dissertations: {
    title: 'Dissertations',
    meta: 'MSc and PhD theses supervised by the group — open for application, in progress, and defended.',
    allStages: 'all stages',
    allLevels: 'all levels',
    stages: {
      open: 'Open for application',
      ongoing: 'Ongoing',
      finished: 'Finished',
    },
    supervisedBy: 'Supervised by',
    authoredBy: 'Authored by',
    requisites: 'Requisites',
    viewThesis: 'View the thesis',
    empty: 'No dissertations match this filter yet.',
    back: '← All dissertations',
    prevPage: '← Newer',
    nextPage: 'Older →',
    pageLabel: 'Page',
    pageOf: 'of',
    rangeOf: 'of',
  },
```

Then the matching **`pt`** block (TypeScript will fail the build if any key is missing) and `dissertations: 'Dissertações'` in `pt.nav`:

```ts
  dissertations: {
    title: 'Dissertações',
    meta: 'Teses de mestrado e doutoramento orientadas pelo grupo — em aberto, em curso e concluídas.',
    allStages: 'todas as fases',
    allLevels: 'todos os níveis',
    stages: {
      open: 'Em aberto',
      ongoing: 'Em curso',
      finished: 'Concluídas',
    },
    supervisedBy: 'Orientação de',
    authoredBy: 'Autoria de',
    requisites: 'Requisitos',
    viewThesis: 'Ver a tese',
    empty: 'Ainda não há dissertações para este filtro.',
    back: '← Todas as dissertações',
    prevPage: '← Mais recentes',
    nextPage: 'Mais antigas →',
    pageLabel: 'Página',
    pageOf: 'de',
    rangeOf: 'de',
  },
```

- [ ] **Step 2: Write the row component**

Create `web/src/components/DissertationRow.tsx`. Mirror `PubRow.tsx` — same server-component shape, same CSS classes, so the two lists read as one system.

```tsx
import React from 'react'
import Link from 'next/link'
import type { Dissertation, Member } from '@/payload-types'
import { getDictionary } from '@/i18n/server'

function PersonName({ name, member }: { name: string; member?: number | Member | null }) {
  const resolved = member && typeof member === 'object' ? member : null
  if (resolved?.slug) {
    return (
      <Link className="author-member-link" href={`/people#${resolved.slug}`}>
        {name}
      </Link>
    )
  }
  return <>{name}</>
}

// Server component so the stage badge and labels follow the active locale, the
// same way PubRow does.
export async function DissertationRow({ item }: { item: Dissertation }) {
  const t = await getDictionary()
  const supervisors = item.supervisors ?? []

  return (
    <article className="pub-item">
      <div className="pub-title">
        {item.slug ? <Link href={`/dissertations/${item.slug}`}>{item.title}</Link> : item.title}
      </div>
      {item.author?.name && (
        <div className="pub-meta">
          <PersonName name={item.author.name} member={item.author.member} />
        </div>
      )}
      {supervisors.length > 0 && (
        <div className="pub-meta">
          {t.dissertations.supervisedBy}{' '}
          {supervisors.map((s, i) => (
            <React.Fragment key={`${s.name}-${i}`}>
              {i > 0 ? ', ' : ''}
              <PersonName name={s.name} member={s.member} />
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="pub-meta">
        <span className="badge">{t.dissertations.stages[item.status]}</span>{' '}
        <span className="badge">{item.level === 'phd' ? 'PhD' : 'MSc'}</span>
      </div>
    </article>
  )
}
```

- [ ] **Step 3: Write the list page**

Create `web/src/app/(frontend)/dissertations/page.tsx`. Pagination and full-coverage facets are required by the spec: a filter that reaches only part of the archive hides content with no way back.

```tsx
import React from 'react'
import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { DissertationRow } from '@/components/DissertationRow'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Dissertations' }

const PER_PAGE = 25
const STAGES = ['open', 'ongoing', 'finished'] as const
const LEVELS = ['msc', 'phd'] as const

type Stage = (typeof STAGES)[number]
type Level = (typeof LEVELS)[number]
type SearchParams = Promise<{ status?: string; level?: string; page?: string }>

export default async function DissertationsPage(props: { searchParams: SearchParams }) {
  const { status, level, page } = await props.searchParams
  const payload = await getPayload({ config })
  const t = await getDictionary()

  const activeStage = STAGES.includes(status as Stage) ? (status as Stage) : undefined
  const activeLevel = LEVELS.includes(level as Level) ? (level as Level) : undefined
  const currentPage = Math.max(1, Number(page) || 1)

  const filter: Where = {}
  if (activeStage) filter.status = { equals: activeStage }
  if (activeLevel) filter.level = { equals: activeLevel }

  const result = await payload.find({
    collection: 'dissertations',
    where: filter,
    // Open topics first, then ongoing, then the archive; newest within each.
    sort: ['status', '-createdAt'],
    limit: PER_PAGE,
    page: currentPage,
    depth: 1,
  })

  const hrefWith = (patch: { status?: string | null; level?: string | null; page?: number }) => {
    const params = new URLSearchParams()
    const nextStage = patch.status === undefined ? activeStage : patch.status
    const nextLevel = patch.level === undefined ? activeLevel : patch.level
    if (nextStage) params.set('status', nextStage)
    if (nextLevel) params.set('level', nextLevel)
    if (patch.page && patch.page > 1) params.set('page', String(patch.page))
    const query = params.toString()
    return query ? `/dissertations?${query}` : '/dissertations'
  }

  const firstShown = result.totalDocs === 0 ? 0 : (currentPage - 1) * PER_PAGE + 1
  const lastShown = Math.min(currentPage * PER_PAGE, result.totalDocs)

  return (
    <div>
      <h1>{t.dissertations.title}</h1>
      <p className="pub-meta" style={{ maxWidth: '60ch' }}>
        {t.dissertations.meta}
      </p>
      <p className="pub-meta">
        {firstShown}–{lastShown} {t.dissertations.rangeOf} {result.totalDocs}
      </p>

      <div className="filters">
        <Link href={hrefWith({ status: null, page: 1 })} className={!activeStage ? 'active' : ''}>
          {t.dissertations.allStages}
        </Link>
        {STAGES.map((stage) => (
          <Link
            key={stage}
            href={hrefWith({ status: stage, page: 1 })}
            className={stage === activeStage ? 'active' : ''}
          >
            {t.dissertations.stages[stage]}
          </Link>
        ))}
      </div>

      <div className="filters">
        <Link href={hrefWith({ level: null, page: 1 })} className={!activeLevel ? 'active' : ''}>
          {t.dissertations.allLevels}
        </Link>
        {LEVELS.map((value) => (
          <Link
            key={value}
            href={hrefWith({ level: value, page: 1 })}
            className={value === activeLevel ? 'active' : ''}
          >
            {value === 'phd' ? 'PhD' : 'MSc'}
          </Link>
        ))}
      </div>

      {result.docs.length === 0 && <div className="empty">{t.dissertations.empty}</div>}

      {result.docs.map((item) => (
        <DissertationRow key={item.id} item={item} />
      ))}

      {result.totalPages > 1 && (
        <nav className="pager" aria-label={t.dissertations.title}>
          {result.hasPrevPage ? (
            <Link className="btn btn-quiet" href={hrefWith({ page: currentPage - 1 })}>
              {t.dissertations.prevPage}
            </Link>
          ) : (
            <span />
          )}
          <span className="mono">
            {t.dissertations.pageLabel} {currentPage} {t.dissertations.pageOf} {result.totalPages}
          </span>
          {result.hasNextPage ? (
            <Link className="btn btn-quiet" href={hrefWith({ page: currentPage + 1 })}>
              {t.dissertations.nextPage}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify in the browser**

```bash
cd web && pnpm dev
```

Check, with the dev server running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/dissertations"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/dissertations?status=finished&page=2"
curl -s "http://localhost:3000/dissertations" | grep -o "Page [0-9]* of [0-9]*"
curl -s -H "Cookie: NEXT_LOCALE=pt" "http://localhost:3000/dissertations" | grep -o "Dissertações\|Em curso"
```

Expected: 200 for both URLs; a pager reading `Page 1 of 3`; the Portuguese strings present.

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/(frontend)/dissertations/page.tsx" web/src/components/DissertationRow.tsx web/src/i18n/messages.ts
git commit -m "feat(web): add the dissertations list page

Paginated with stage and level filters from the start — the publications list
shipped without them and hid 43% of its archive."
```

---

### Task 6: The detail page

**Files:**
- Create: `web/src/app/(frontend)/dissertations/[slug]/page.tsx`

**Interfaces:**
- Consumes: collection `dissertations`; dictionary block `dissertations` from Task 5.
- Produces: route `/dissertations/[slug]`.

- [ ] **Step 1: Write the page**

Create `web/src/app/(frontend)/dissertations/[slug]/page.tsx`, following `publications/[slug]/page.tsx`.

```tsx
import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { Dissertation, Member } from '@/payload-types'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL } from '@/lib/site'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

async function findDissertation(slug: string): Promise<Dissertation | null> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'dissertations',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] ?? null
}

export async function generateMetadata(props: { params: Params }) {
  const { slug } = await props.params
  const item = await findDissertation(slug)
  if (!item) return {}
  return {
    title: item.title,
    openGraph: {
      title: item.title,
      type: 'article',
      url: `${SITE_URL}/dissertations/${item.slug}`,
    },
  }
}

function PersonName({ name, member }: { name: string; member?: number | Member | null }) {
  const resolved = member && typeof member === 'object' ? member : null
  if (resolved?.slug) {
    return (
      <Link className="author-member-link" href={`/people#${resolved.slug}`}>
        {name}
      </Link>
    )
  }
  return <>{name}</>
}

export default async function DissertationPage(props: { params: Params }) {
  const { slug } = await props.params
  const t = await getDictionary()
  const item = await findDissertation(slug)
  if (!item) notFound()

  const supervisors = item.supervisors ?? []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Thesis',
    headline: item.title,
    inSupportOf: item.level === 'phd' ? 'PhD' : 'MSc',
    ...(item.author?.name ? { author: { '@type': 'Person', name: item.author.name } } : {}),
    ...(supervisors.length > 0
      ? { contributor: supervisors.map((s) => ({ '@type': 'Person', name: s.name })) }
      : {}),
    ...(item.fenixUrl ? { sameAs: item.fenixUrl } : {}),
  }

  return (
    <article>
      <JsonLd data={jsonLd} />
      <div className="article-head">
        <div className="pub-eyebrow">
          {t.dissertations.stages[item.status]} · {item.level === 'phd' ? 'PhD' : 'MSc'}
        </div>
        <h1>{item.title}</h1>
        {item.author?.name && (
          <p className="pub-meta">
            {t.dissertations.authoredBy}{' '}
            <PersonName name={item.author.name} member={item.author.member} />
          </p>
        )}
        {supervisors.length > 0 && (
          <p className="pub-meta">
            {t.dissertations.supervisedBy}{' '}
            {supervisors.map((s, i) => (
              <React.Fragment key={`${s.name}-${i}`}>
                {i > 0 ? ', ' : ''}
                <PersonName name={s.name} member={s.member} />
              </React.Fragment>
            ))}
          </p>
        )}
        {item.fenixUrl && (
          <p>
            <a className="btn" href={item.fenixUrl} target="_blank" rel="noreferrer">
              {t.dissertations.viewThesis} →
            </a>
          </p>
        )}
      </div>

      {item.description && (
        <section className="rich-text">
          <RichText data={item.description} />
        </section>
      )}

      {item.requisites && (
        <section className="summary-card">
          <h2>{t.dissertations.requisites}</h2>
          <div className="rich-text">
            <RichText data={item.requisites} />
          </div>
        </section>
      )}

      <p style={{ marginTop: '2.5rem' }}>
        <Link href="/dissertations">{t.dissertations.back}</Link>
      </p>
    </article>
  )
}
```

- [ ] **Step 2: Verify against a real record**

With the dev server running:

```bash
SLUG=$(docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -t -A -c "select slug from dissertations where fenix_url is not null limit 1;")
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/dissertations/$SLUG"
curl -s "http://localhost:3000/dissertations/$SLUG" | grep -o "View the thesis\|Supervised by"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/dissertations/does-not-exist"
```

Expected: 200 for the real slug with both labels present; 404 for the unknown slug.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(frontend)/dissertations/[slug]/page.tsx"
git commit -m "feat(web): add the dissertation detail page

The legacy finished page is a single 133 KB document with 39 abstracts inline;
splitting list from detail follows the pattern publications already use."
```

---

### Task 7: Wire the section into the site and retire `/opportunities`

**Files:**
- Modify: `web/src/app/(frontend)/layout.tsx:60-70` (NAV), `:139-144` (footer links)
- Modify: `web/src/app/sitemap.ts`
- Modify: `web/src/app/(frontend)/search/page.tsx`
- Modify: `web/src/app/api/health/admin/route.ts`
- Modify: `web/src/app/(frontend)/page.tsx` (homepage "Join us" banner and open-topic counts)
- Modify: `ai/app/entities.py`, `ai/tests/test_entities.py`
- Modify: `web/CLAUDE.md`
- Delete: `web/src/app/(frontend)/opportunities/page.tsx`

**Interfaces:**
- Consumes: route `/dissertations` from Tasks 5–6.
- Produces: no new exports. After this task `pnpm typecheck` and `pnpm build` must be clean.

- [ ] **Step 1: Find every remaining reference**

```bash
cd .. && grep -rn "thesis-topics\|thesisTopics\|opportunities" web/src ai/app --include=*.ts --include=*.tsx --include=*.py | grep -v payload-types
```

Work through the list; the steps below cover the known ones.

- [ ] **Step 2: Navigation and footer**

In `web/src/app/(frontend)/layout.tsx`, put Dissertations after Publications and drop the Opportunities entry:

```ts
const NAV = [
  { href: '/people', key: 'people' },
  { href: '/publications', key: 'publications' },
  { href: '/dissertations', key: 'dissertations' },
  { href: '/news', key: 'news' },
  { href: '/events', key: 'events' },
  { href: '/reading-groups', key: 'readingGroups' },
] as const
```

In the footer links block, replace the `/opportunities` link with:

```tsx
              <Link href="/dissertations">{t.nav.dissertations}</Link>
```

and delete the now-unused `footer.openThesis` key from both locales in `web/src/i18n/messages.ts`.

> Note: `People` moves to the front here on the user's instruction; it also matches the legacy site, where Team is the first section. `Open positions` is **not** added in this stage — it arrives with its own collection later.

- [ ] **Step 3: Homepage**

In `web/src/app/(frontend)/page.tsx`, change the open-topic count query and the banner link:

```ts
    payload.count({ collection: 'dissertations', where: { status: { equals: 'open' } } }),
```

and

```tsx
            <Link className="btn" href="/dissertations?status=open">
              {t.home.browseTopics}
            </Link>
```

- [ ] **Step 4: Search page**

In `web/src/app/(frontend)/search/page.tsx`: rename `'thesis-topics'` to `'dissertations'` in `ENTITY_TYPES`; change the `ENTITY_LINK` entry to

```ts
  dissertations: (hit) => (hit.slug ? `/dissertations/${hit.slug}` : '/dissertations'),
```

and in `textualFallback` change the branch to query `collection: 'dissertations'` with `entity_type: 'dissertations' as const`. Rename the `entityTypes['thesis-topics']` dictionary key to `dissertations` in **both** locales (`'Dissertation'` / `'Dissertação'`).

- [ ] **Step 5: Health route and AI adapter**

In `web/src/app/api/health/admin/route.ts` replace `'thesis-topics'` with `'dissertations'` in the `CollectionSlug` union, the `payload.count` call and the `counts` object.

In `ai/app/entities.py` rename the `"thesis-topics"` key of `ENTITY_ADAPTERS` to `"dissertations"` and rename `_thesis_text` to `_dissertation_text`. In `ai/app/api/routes.py` change the `elif entity_type == "thesis-topics":` branch to `"dissertations"`.

In `ai/tests/test_entities.py` update any reference to the old slug, then:

```bash
cd ai && python -m pytest tests/test_entities.py -q
```

Expected: pass.

- [ ] **Step 6: Sitemap and page deletion**

In `web/src/app/sitemap.ts` replace `'/opportunities'` with `'/dissertations'`, and add dissertation detail URLs alongside the publication ones:

```ts
    payload.find({
      collection: 'dissertations',
      limit: 500,
      depth: 0,
      select: { slug: true, updatedAt: true },
    }),
```

spreading its docs into the returned array the same way `pubs` and `news` are.

```bash
rm "web/src/app/(frontend)/opportunities/page.tsx"
```

Delete the `opportunities` dictionary block from both locales.

- [ ] **Step 7: Update the docs**

In `web/CLAUDE.md`, in the conventions list, replace the "Public list pages must be exhaustively reachable" bullet's example reference so it names both list pages, and add:

```markdown
- **`dissertations` covers the whole life of a thesis** (`open` → `ongoing` →
  `finished`); it is the collection formerly called `thesis-topics`. Open topics are
  a *stage*, not a separate section — `/opportunities` was removed because the two
  were the same content under two names.
```

- [ ] **Step 8: Full verification**

```bash
cd web && pnpm generate:types && pnpm typecheck && pnpm lint && pnpm build
```

Expected: typecheck clean; `pnpm lint` shows **only** the 3 pre-existing errors in `ThemeToggle.tsx` and `TopicMapChart.tsx`; build succeeds and lists `/dissertations` and `/dissertations/[slug]` but no `/opportunities`.

Then, with the dev server running:

```bash
for p in / /people /publications /dissertations /news /events /reading-groups /search; do
  printf "%s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000$p"
done
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/opportunities"
```

Expected: 200 for every listed route; 404 for `/opportunities`.

- [ ] **Step 9: Commit**

```bash
git add -A web/src ai/app ai/tests web/CLAUDE.md
git commit -m "feat: put dissertations in the navigation and retire /opportunities

Open topics were the first stage of the dissertations collection shown under a
second name, which is why the section had two homes and 40 defended theses had
none. The portal is not deployed, so the old URL is dropped rather than
redirected."
```

---

## Self-Review

**Spec coverage.** Spec §3.1 (collection and fields) → Tasks 1–2. §3.2 (list and detail pages, semantic-search adapter) → Tasks 5, 6, 7 Step 5. §3.3 (importer, parsing rules, both entry variants, idempotency) → Tasks 3–4. §2 (`/opportunities` deleted, nav order) → Task 7. Spec items **not** in this plan and deliberately deferred to later stages: `/research` removal, the publications histogram, section-scoped search, member photos, roster reconciliation, open positions.

**Known deviation from the spec.** The spec placed the importer at `ai/app/pipelines/import_dissertations.py`. This plan puts it in `web/scripts/` instead: scraping the legacy site involves no AI, `ai/CLAUDE.md` scopes that folder to AI batch jobs, and `web/scripts/` already holds two content importers with the pure-lib-plus-`node --test` pattern this one follows. Writing through `payload run` also avoids `PAYLOAD_API_KEY`, which is currently empty.

**Placeholders.** None: every code step carries its full implementation, and every verification step names the command and the expected output.

**Type consistency.** `parseDissertationPage`, `parseAttribution` and `htmlToLexical` keep the same signatures in Tasks 3 and 4. The collection field names (`supervisors`, `author.name`, `author.member`, `requisites`, `fenixUrl`, `sourceUrl`) are identical in Tasks 2, 4, 5 and 6. Status values `open` / `ongoing` / `finished` are the same in the migration, the collection, the importer, the pages and the dictionary. Dictionary keys used in Tasks 5–6 (`stages`, `supervisedBy`, `authoredBy`, `requisites`, `viewThesis`, `back`, `rangeOf`, `pageLabel`, `pageOf`, `prevPage`, `nextPage`, `empty`, `meta`, `title`, `allStages`, `allLevels`) are all defined in Task 5 Step 1.
