# Open Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the group the Open positions section its existing site has — paid research jobs, distinct from dissertation topics — with an empty state designed for the fact that it is empty most of the year.

**Architecture:** One new Payload collection with no relationships, one migration, one public page, one nav entry. The page derives its empty state from the data rather than from hand-typed copy, which is the one thing the legacy page gets wrong.

**Tech Stack:** Next.js 16 App Router + Payload CMS 3 (TypeScript), PostgreSQL.

## Global Constraints

- **Site languages are English and Português only. No Russian may appear in the UI.** Every visible string goes through `web/src/i18n/messages.ts` in **both** `en` and `pt`; `en` defines the type and `pt` must satisfy it, so a missing key is a compile error.
- **Code, comments, docs and commit messages in English.** Comments explain what, why, and why this way.
- Small, single-purpose files. Follow existing patterns; match the surrounding code.
- Public pages are **Server Components**. Do not add `'use client'`.
- Access control uses the helpers in `web/src/access/index.ts` (`anyone`, `adminOrEditor`) — never inline role checks in a collection.
- Reuse `slugField` from `web/src/fields/slug.ts`.
- Migrations are hand-written SQL in the style of `web/src/migrations/*.ts`, registered in `web/src/migrations/index.ts` with the name matching the filename exactly, and must have a working `down`.
- After the collection change run `pnpm generate:types`.
- Never name a `.map()`/`.filter()` callback parameter `t` — it shadows the dictionary.
- Verification: `pnpm typecheck`, `pnpm lint`, `pnpm build`. **`pnpm lint` reports 3 pre-existing errors** in `ThemeToggle.tsx` and `TopicMapChart.tsx` — not yours; add none.

## Why this is its own section, not part of Dissertations

They are different processes with different people at the door:

| | Open position | Dissertation topic |
|---|---|---|
| Who applies | someone with a degree, looking for a job | a student already enrolled at IST |
| What they get | a salary and a contract | a topic and a supervisor |
| Where they apply | Euraxess / the institute's HR | directly to the professor |
| Deadline | hard | none |
| Appears when | the group wins a grant | continuously |

The legacy site keeps them apart for that reason and we follow it.

## The empty state is the normal state

The group posts a position roughly once a year, so the page is empty most of the time. That is the state to design, not an afterthought — a dashed `.empty` box reads as "something is broken here".

The legacy page shows what to avoid: it says *"Currently, there are no open positions"* in hand-typed prose **while linking to a live vacancy underneath**. Copy and data drifted apart because a human had to remember to update both. Ours derives the message from the query, so the contradiction cannot happen.

## Reference facts

- Nav today: People · Publications · Dissertations · News · Events · Reading Groups, plus the search icon. Adding one entry makes seven; the hamburger breakpoint is 1240px and the row measured ~1210px at six. **Measure it during implementation** and raise the breakpoint if the row wraps.
- `research_themes_rels` and other `*_rels` tables exist for collections with relationships. **This collection has none**, so no `_rels` table is needed.
- Postgres runs in Docker as `ai-portal-inesc-db-1`, database `mlkd`, user `mlkd`.

## File Structure

**Create**
- `web/src/collections/OpenPositions.ts`
- `web/src/migrations/20260811_130000_open_positions.ts`
- `web/src/app/(frontend)/open-positions/page.tsx`

**Modify**
- `web/src/payload.config.ts`, `web/src/migrations/index.ts`
- `web/src/app/(frontend)/layout.tsx` (nav), `web/src/app/sitemap.ts`
- `web/src/i18n/messages.ts`, `web/src/app/(frontend)/styles.css`

---

### Task 1: The collection and its migration

**Files:**
- Create: `web/src/collections/OpenPositions.ts`, `web/src/migrations/20260811_130000_open_positions.ts`
- Modify: `web/src/payload.config.ts`, `web/src/migrations/index.ts`

**Interfaces:**
- Produces: collection slug `open-positions`; Payload type `OpenPosition`; fields `title`, `slug`, `kind` (`phd` | `postdoc` | `researcher` | `internship`), `status` (`open` | `closed`), `deadline`, `applyUrl`, `description`, `contactEmail`.

- [ ] **Step 1: Write the collection**

Create `web/src/collections/OpenPositions.ts`:

```ts
import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

// Paid research jobs — a PhD contract, a postdoc, a junior researcher post. Kept
// apart from `dissertations` because it is a different process with a different
// person at the door: an applicant here has a degree and wants a salary, while a
// dissertation topic is picked by a student already enrolled at the university.
export const OpenPositions: CollectionConfig = {
  slug: 'open-positions',
  labels: { singular: 'Open position', plural: 'Open positions' },
  admin: {
    useAsTitle: 'title',
    group: 'Opportunities',
    defaultColumns: ['title', 'kind', 'status', 'deadline'],
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
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'phd',
          options: [
            { label: 'PhD position', value: 'phd' },
            { label: 'Postdoc', value: 'postdoc' },
            { label: 'Researcher', value: 'researcher' },
            { label: 'Internship', value: 'internship' },
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
            { label: 'Open', value: 'open' },
            { label: 'Closed', value: 'closed' },
          ],
          admin: {
            width: '50%',
            description: 'Only open positions are shown on the site; closed ones stay for the record.',
          },
        },
      ],
    },
    {
      name: 'deadline',
      type: 'date',
      admin: {
        description: 'Application deadline, if the call has one.',
        date: { pickerAppearance: 'dayOnly' },
      },
    },
    {
      name: 'applyUrl',
      type: 'text',
      admin: { description: 'Where to apply — usually the Euraxess posting.' },
    },
    { name: 'description', type: 'richText' },
    {
      name: 'contactEmail',
      type: 'email',
      admin: { description: 'Shown on the position when there is no application link.' },
    },
  ],
}
```

- [ ] **Step 2: Register it**

In `web/src/payload.config.ts` import `OpenPositions` beside the other collections and add it to the `collections: [...]` array, after `Dissertations`.

- [ ] **Step 3: Write the migration**

Create `web/src/migrations/20260811_130000_open_positions.ts`:

```ts
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Paid research jobs. No relationship fields, so there is no companion _rels table
// — only the collection's own table plus the usual locked-documents column.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_open_positions_kind" AS ENUM('phd', 'postdoc', 'researcher', 'internship');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "enum_open_positions_status" AS ENUM('open', 'closed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "open_positions" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "slug" varchar,
      "kind" "enum_open_positions_kind" DEFAULT 'phd' NOT NULL,
      "status" "enum_open_positions_status" DEFAULT 'open' NOT NULL,
      "deadline" timestamp(3) with time zone,
      "apply_url" varchar,
      "description" jsonb,
      "contact_email" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "open_positions_slug_idx" ON "open_positions" ("slug");
    CREATE INDEX IF NOT EXISTS "open_positions_status_idx" ON "open_positions" ("status");
    CREATE INDEX IF NOT EXISTS "open_positions_updated_at_idx" ON "open_positions" ("updated_at");
    CREATE INDEX IF NOT EXISTS "open_positions_created_at_idx" ON "open_positions" ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "open_positions_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_open_positions_fk"
        FOREIGN KEY ("open_positions_id") REFERENCES "open_positions"("id") ON DELETE cascade;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_open_positions_id_idx" ON "payload_locked_documents_rels" ("open_positions_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "open_positions_id";
    DROP TABLE IF EXISTS "open_positions" CASCADE;
    DROP TYPE IF EXISTS "enum_open_positions_status";
    DROP TYPE IF EXISTS "enum_open_positions_kind";
  `)
}
```

Register it in `web/src/migrations/index.ts` following the existing pattern.

- [ ] **Step 4: Run, verify, reverse, re-apply**

```bash
cd web && pnpm payload migrate
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "\d open_positions"
pnpm payload migrate:down
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "\dt open_positions"
pnpm payload migrate
```

Expected: the table appears with all nine columns; `migrate:down` removes it; `migrate` brings it back. **If `migrate:down` errors, fix `down` before continuing — a migration you cannot reverse is not done.**

- [ ] **Step 5: Prove the collection round-trips**

Write a temporary script and run it with `pnpm payload run <script>`, using `getPayload({ config })` and `import config from '@payload-config'`, to `create` a position with every field set, `findByID` it and assert each field came back, then `delete` it. For the richText field use the shape already in this database:

```json
{"root":{"type":"root","children":[{"type":"paragraph","children":[{"text":"…","type":"text"}]}]}}
```

Paste the output into your report and **delete the temporary script** so it is not committed. A schema that disagrees with the collection config only shows up at runtime, which is why this step exists.

- [ ] **Step 6: Commit**

```bash
cd .. && git add web/src/collections/OpenPositions.ts web/src/migrations/ web/src/payload.config.ts web/src/payload-types.ts
git commit -m "feat(web): add the open-positions collection

Paid research jobs, kept apart from dissertations because it is a different
process with a different applicant: a degree and a salary rather than a topic
and a supervisor. Only open positions will be public; closed ones stay for the
record."
```

---

### Task 2: The page, the navigation and the empty state

**Files:**
- Create: `web/src/app/(frontend)/open-positions/page.tsx`
- Modify: `web/src/app/(frontend)/layout.tsx`, `web/src/app/sitemap.ts`, `web/src/i18n/messages.ts`, `web/src/app/(frontend)/styles.css`

**Interfaces:**
- Consumes: collection `open-positions` and type `OpenPosition` from Task 1.
- Produces: route `/open-positions`.

- [ ] **Step 1: Add the dictionary entries**

In `web/src/i18n/messages.ts`, add a new block to **`en`** after `dissertations`:

```ts
  openPositions: {
    title: 'Open positions',
    meta: 'Funded research posts at MLKD. For MSc and PhD thesis topics, see the dissertations.',
    kinds: {
      phd: 'PhD position',
      postdoc: 'Postdoc',
      researcher: 'Researcher',
      internship: 'Internship',
    },
    deadline: 'Apply by',
    apply: 'Apply',
    contact: 'Contact',
    emptyHead: 'No open positions right now',
    emptyLede:
      'Funded posts open when a new project starts, usually once or twice a year. In the meantime, the group supervises MSc and PhD dissertations — and speculative enquiries are welcome.',
    emptyDissertations: 'Browse dissertation topics',
  },
```

and the same block in **`pt`**:

```ts
  openPositions: {
    title: 'Vagas',
    meta: 'Posições de investigação financiadas no MLKD. Para temas de tese de mestrado e doutoramento, consulte as dissertações.',
    kinds: {
      phd: 'Doutoramento',
      postdoc: 'Pós-doutoramento',
      researcher: 'Investigador',
      internship: 'Estágio',
    },
    deadline: 'Candidaturas até',
    apply: 'Candidatar',
    contact: 'Contacto',
    emptyHead: 'Não há vagas abertas de momento',
    emptyLede:
      'As posições financiadas abrem quando começa um novo projeto, normalmente uma ou duas vezes por ano. Entretanto, o grupo orienta dissertações de mestrado e doutoramento — e candidaturas espontâneas são bem-vindas.',
    emptyDissertations: 'Ver temas de dissertação',
  },
```

Also add `openPositions: 'Open positions'` to `en.nav` and `openPositions: 'Vagas'` to `pt.nav`.

- [ ] **Step 2: Write the page**

Create `web/src/app/(frontend)/open-positions/page.tsx`:

```tsx
import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { OpenPosition } from '@/payload-types'
import { getDictionary, getLocale } from '@/i18n/server'
import { dateLocale } from '@/i18n/config'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Open positions' }

export default async function OpenPositionsPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const locale = await getLocale()

  // Closed positions stay in the database for the record but never reach the site.
  const result = await payload.find({
    collection: 'open-positions',
    where: { status: { equals: 'open' } },
    sort: 'deadline',
    limit: 100,
    depth: 0,
  })

  const formatDeadline = (value?: string | null) =>
    value
      ? new Date(value).toLocaleDateString(dateLocale[locale], {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null

  const renderPosition = (position: OpenPosition) => {
    const deadline = formatDeadline(position.deadline)
    return (
      <article key={position.id} id={position.slug ?? undefined} className="card">
        <h3>{position.title}</h3>
        <div className="pub-meta">
          <span className="badge badge-open">{t.openPositions.kinds[position.kind]}</span>
          {deadline ? (
            <>
              {' '}
              <span className="mono">
                {t.openPositions.deadline} {deadline}
              </span>
            </>
          ) : null}
        </div>
        {position.description ? (
          <div className="rich-text" style={{ fontSize: '0.92rem' }}>
            <RichText data={position.description} />
          </div>
        ) : null}
        <div className="card-foot">
          {position.applyUrl ? (
            <a className="btn" href={position.applyUrl} target="_blank" rel="noreferrer">
              {t.openPositions.apply} →
            </a>
          ) : position.contactEmail ? (
            <a className="btn" href={`mailto:${position.contactEmail}`}>
              {t.openPositions.contact} →
            </a>
          ) : null}
        </div>
      </article>
    )
  }

  return (
    <div>
      <h1>{t.openPositions.title}</h1>
      <p className="pub-meta" style={{ maxWidth: '60ch' }}>
        {t.openPositions.meta}
      </p>

      {result.docs.length === 0 ? (
        // Empty is this page's normal state — the group opens a funded post once or
        // twice a year. So it gets a designed answer rather than a dashed "nothing
        // here" box, and the message is derived from the query: the legacy site
        // hand-types "no open positions" and contradicts itself the moment someone
        // forgets to edit it.
        <section className="positions-empty">
          <h2>{t.openPositions.emptyHead}</h2>
          <p>{t.openPositions.emptyLede}</p>
          <Link className="btn" href="/dissertations?status=open">
            {t.openPositions.emptyDissertations} →
          </Link>
        </section>
      ) : (
        <div className="card-grid">{result.docs.map(renderPosition)}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Style the empty state**

In `web/src/app/(frontend)/styles.css`, after the `.empty` rule:

```css
/* This page is empty most of the year, so its empty state is the design, not a
   fallback: a heading, an explanation and a route onward. */
.positions-empty {
  border: 1px solid var(--ink-12);
  border-radius: var(--radius);
  background: var(--card);
  padding: 2rem 1.75rem;
  max-width: 62ch;
  box-shadow: var(--shadow-sm);
}

.positions-empty h2 {
  margin-top: 0;
  padding-left: 0;
  font-size: 1.3rem;
}

.positions-empty h2::before {
  display: none;
}

.positions-empty p {
  color: var(--ink-70);
}
```

- [ ] **Step 4: Add it to the navigation and the sitemap**

In `web/src/app/(frontend)/layout.tsx`, append to `NAV`:

```ts
  { href: '/open-positions', key: 'openPositions' },
```

It goes last, matching the legacy site's order.

In `web/src/app/sitemap.ts` add `'/open-positions'` to the statics list.

- [ ] **Step 5: Verify, including the nav width**

```bash
cd web && pnpm generate:types && pnpm typecheck && pnpm build
```

With the dev server running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/open-positions"
curl -s "http://localhost:3000/open-positions" | grep -o "No open positions right now"
curl -s -H "Cookie: NEXT_LOCALE=pt" "http://localhost:3000/open-positions" | grep -o "Não há vagas abertas de momento"
curl -s "http://localhost:3000/publications" | grep -o 'href="/open-positions"'
curl -s "http://localhost:3000/sitemap.xml" | grep -c "open-positions"
```

Expected: 200; the English and Portuguese empty states render; the nav link appears on another page; the sitemap contains the route.

Then **create one position through the admin or a temporary `payload run` script**, reload the page, confirm the card renders with its kind badge, deadline and Apply button, and that the empty state is gone. Delete the test record afterwards and say so in your report. A page whose only tested state is "empty" is not tested.

Finally, **measure the navigation**: the row now has seven items plus the search icon, and the hamburger breakpoint is 1240px. Load the site at 1280px wide and confirm the nav is still a single row; if it wraps, raise the breakpoint in `styles.css` and say so.

- [ ] **Step 6: Commit**

```bash
cd .. && git add -A web/src
git commit -m "feat(web): add the open positions page

The section the group's own site has for funded posts. Its empty state is the
design rather than a fallback — the group opens a position once or twice a year,
so that is what a visitor usually sees — and the message is derived from the
query: the legacy page hand-types 'no open positions' while linking a live
vacancy underneath."
```

---

## Self-Review

**Spec coverage.** Legacy-parity spec §6 (collection fields, public page shows open only, closed kept for the record, designed empty state derived from data) → Tasks 1 and 2. The nav entry and sitemap come with Task 2.

**Placeholders.** None: every code step carries its implementation, and every verification step names the command and the expected output.

**Type consistency.** The collection's `kind` values (`phd`, `postdoc`, `researcher`, `internship`) match the `openPositions.kinds` dictionary keys the page indexes with `position.kind`, in both locales; a mismatch is a compile error because `kinds` is a literal object and `kind` is a union. `status` values (`open`, `closed`) match the migration's enum and the page's `where` clause. Field names in the collection, the migration's columns (snake_cased by Payload's adapter) and the page's reads line up: `applyUrl`/`apply_url`, `contactEmail`/`contact_email`, `deadline`, `description`.

**One risk worth naming.** Task 2's `t.openPositions.kinds[position.kind]` indexes a dictionary object with a union-typed key. If TypeScript complains that `kind` may be `string`, the collection's `options` are not being narrowed — check `payload-types.ts` was regenerated after Task 1 rather than widening the type with a cast.
