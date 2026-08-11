# People Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every member a page of their own at `/people/[slug]`, shrink the People cards to what identifies a person, and link eight co-authors the current matcher correctly refuses to guess.

**Architecture:** Shared presentation logic (initials, photo resolution, the visibility-aware links row) moves out of the People page into `src/lib/member.ts` and `src/components/PersonLinks.tsx` so the list and the profile render the same person the same way. The profile page follows the `publications/[slug]` pattern: a Server Component, `force-dynamic`, paginated with the pager already used twice in this codebase. The co-author fix is a one-off script driving Payload's Local API from an explicit allowlist.

**Tech Stack:** Next.js 16 App Router + Payload CMS 3 (TypeScript), PostgreSQL, `node --test` for pure script logic, `pnpm payload run` for scripts that touch the database.

## Global Constraints

Copied from the root and `web/` CLAUDE.md — every task must honour these.

- **Site languages are English and Português only. No Russian may appear in the UI or any user-facing content.** Every visible string goes through `web/src/i18n/messages.ts` and must be added to **both** `en` and `pt`. `en` defines the `Dictionary` type and `pt` must satisfy it, so a missing key is a compile error. Never hardcode visible copy.
- **Code, comments, docs and commit messages are in English.**
- **Comments explain what, why, and why this way** — the intent and the trade-off, not a restatement of the code.
- **Small, single-purpose files.** A large file is a smell.
- **Follow existing patterns before inventing new ones**; match the surrounding code.
- Public pages are **Server Components**. Do not add `'use client'`.
- **Payload owns content.** Scripts write through the Local API (`payload run`), never raw SQL.
- Public publication queries filter with `PUBLISHED` / `published()` from `web/src/lib/queries.ts`. Dissertations and members are not editorially gated and need no such filter.
- Watch for shadowing: never name a `.map()`/`.filter()` callback parameter `t` — it hides the dictionary.
- After any collection change run `pnpm generate:types`.
- Verification: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm scripts:test`. **`pnpm lint` reports 3 pre-existing errors** in `ThemeToggle.tsx` and `TopicMapChart.tsx` — not yours; do not add more.

## Reference facts (measured 2026-08-11, do not re-derive)

- 113 members. 56 have a photo. 81 have zero publications. No member has a bio.
- All 252 publications carry the group leader (member id 1) as an author.
- `pnpm publications:link-members` reports 0 linkable rows and 2 ambiguous, and is correct to: the author string `Gonçalo Oliveira` matches both member `Gonçalo Oliveira` and member `Gonçalo Goulart Oliveira`.
- Payload stores publication authors as an array field `authors: [{ name, member }]`, queryable as `authors.name` and `authors.member`.
- Dissertations store `supervisors: [{ name, member }]` and `author: { name, member }`.

## File Structure

**Create**
- `web/scripts/lib/author-aliases.mjs` — the allowlist plus the pure re-linking function
- `web/scripts/tests/author-aliases.test.mjs`
- `web/scripts/link-author-aliases.mjs` — Local API driver
- `web/src/lib/member.ts` — `initials`, `memberPhotoUrl`, `visibleLinks`
- `web/src/components/PersonLinks.tsx` — the visibility-aware links row
- `web/src/components/PersonCard.tsx` — the list card
- `web/src/app/(frontend)/people/[slug]/page.tsx`

**Modify**
- `web/src/app/(frontend)/people/page.tsx` — use the extracted pieces, drop the bibliography
- `web/src/components/PubRow.tsx`, `web/src/components/DissertationRow.tsx`, `web/src/components/MemberAvatarStack.tsx` — anchor → route
- `web/src/app/(frontend)/publications/[slug]/page.tsx`, `web/src/app/(frontend)/dissertations/[slug]/page.tsx`, `web/src/app/(frontend)/search/page.tsx` — anchor → route
- `web/src/app/sitemap.ts` — person pages
- `web/src/i18n/messages.ts` — new keys in `en` and `pt`
- `web/package.json` — script entries

---

### Task 1: Link eight co-authors by explicit allowlist

**Files:**
- Create: `web/scripts/lib/author-aliases.mjs`
- Test: `web/scripts/tests/author-aliases.test.mjs`
- Create: `web/scripts/link-author-aliases.mjs`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `AUTHOR_ALIASES` (array of `{ member: string, alias: string }`), `linkAliasInAuthors(authors, alias, memberId) → { authors, changed }`.

- [ ] **Step 1: Write the failing test**

Create `web/scripts/tests/author-aliases.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { AUTHOR_ALIASES, linkAliasInAuthors } from '../lib/author-aliases.mjs'

test('the allowlist holds the eight reviewed pairs and nothing else', () => {
  assert.equal(AUTHOR_ALIASES.length, 8)
  assert.ok(AUTHOR_ALIASES.every((p) => p.member && p.alias))
  // The ambiguous pair must never be listed: the author string "Gonçalo Oliveira"
  // matches two different members.
  assert.ok(!AUTHOR_ALIASES.some((p) => p.alias === 'Gonçalo Oliveira'))
})

test('links the matching author row and reports the change', () => {
  const authors = [
    { name: 'Arlindo L. Oliveira', member: 1 },
    { name: 'Alexandre P. Francisco', member: null },
  ]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 1)
  assert.equal(out.authors[1].member, 7)
  assert.equal(out.authors[0].member, 1, 'other authors are untouched')
})

test('matches the alias ignoring case, accents and stray whitespace', () => {
  const authors = [{ name: '  alexandre p. francisco ', member: null }]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 1)
  assert.equal(out.authors[0].member, 7)
})

test('never overwrites an author already linked to someone', () => {
  const authors = [{ name: 'Alexandre P. Francisco', member: 99 }]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 0)
  assert.equal(out.authors[0].member, 99)
})

test('reports no change when the alias is absent', () => {
  const authors = [{ name: 'Someone Else', member: null }]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 0)
  assert.deepEqual(out.authors, authors)
})

test('keeps a member object rather than flattening it to an id', () => {
  // Payload returns relationships as objects at depth > 0; the writer must not
  // clobber an existing link just because it is shaped differently.
  const authors = [{ name: 'Alexandre P. Francisco', member: { id: 99 } }]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 0)
})
```

- [ ] **Step 2: Run the test to watch it fail**

Run: `cd web && node --test scripts/tests/author-aliases.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the library**

Create `web/scripts/lib/author-aliases.mjs`:

```js
// Publications carry the academic form of a name ("Alexandre P. Francisco") while
// our member records carry the everyday one ("Alexandre Francisco"), so eight
// members are authors of papers we already hold without being linked to them.
//
// This is an explicit allowlist rather than a looser rule in the general matcher.
// A rule loose enough to catch these eight is loose enough to attribute someone
// else's paper: the author string "Gonçalo Oliveira" matches both our
// "Gonçalo Oliveira" and our "Gonçalo Goulart Oliveira", which is why the existing
// linker reports it ambiguous and refuses. Each pair below was checked by hand
// against the publication list; a misattributed paper is worse than a missing one.

import { normalizeName } from './member-importer.mjs'

export const AUTHOR_ALIASES = [
  { member: 'Alexandre Francisco', alias: 'Alexandre P. Francisco' },
  { member: 'Sara Madeira', alias: 'Sara C. Madeira' },
  { member: 'Alexandra Carvalho', alias: 'Alexandra M. Carvalho' },
  { member: 'Pedro Monteiro', alias: 'Pedro T. Monteiro' },
  { member: 'André Martins', alias: 'André L. Martins' },
  { member: 'Nuno Mendes', alias: 'Nuno D. Mendes' },
  { member: 'Pedro Stralen', alias: 'Pedro Van Stralen' },
  { member: 'Clara Pereira', alias: 'Clara Martins Pereira' },
]

/**
 * Attach `memberId` to every author row whose name is `alias` and which is not
 * already linked to somebody. Returns a new array plus how many rows changed, so
 * the caller can skip a write that would be a no-op.
 */
export function linkAliasInAuthors(authors, alias, memberId) {
  const target = normalizeName(alias)
  let changed = 0

  const next = (authors ?? []).map((author) => {
    if (author.member) return author
    if (normalizeName(author.name ?? '') !== target) return author
    changed += 1
    return { ...author, member: memberId }
  })

  return { authors: changed > 0 ? next : authors, changed }
}
```

- [ ] **Step 4: Run the test until it passes**

Run: `cd web && node --test scripts/tests/author-aliases.test.mjs`
Expected: 6/6 passing.

- [ ] **Step 5: Write the Local API driver**

Create `web/scripts/link-author-aliases.mjs`:

```js
/**
 * Link the eight reviewed author aliases to their member records.
 *
 * Run:  pnpm authors:link-aliases              (dry run, writes a report)
 *       pnpm authors:link-aliases:apply
 *
 * See lib/author-aliases.mjs for why this is an allowlist and not a rule.
 * Idempotent: a row already linked is left alone, so a re-run changes nothing.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import { AUTHOR_ALIASES, linkAliasInAuthors } from './lib/author-aliases.mjs'
import { normalizeName } from './lib/member-importer.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

// `payload run` does not forward unknown CLI flags, so the apply switch is an env
// var compared strictly: anything other than "1" stays a dry run.
const apply = process.env.AUTHOR_ALIASES_APPLY === '1'

async function run() {
  const payload = await getPayload({ config })

  const members = (await payload.find({ collection: 'members', limit: 1000, depth: 0 })).docs
  const byName = new Map()
  for (const member of members) {
    const key = normalizeName(member.name)
    if (byName.has(key)) byName.set(key, 'AMBIGUOUS')
    else byName.set(key, member)
  }

  const report = { mode: apply ? 'apply' : 'dry-run', linked: [], skipped: [], errors: [] }

  for (const { member: memberName, alias } of AUTHOR_ALIASES) {
    const member = byName.get(normalizeName(memberName))

    if (!member || member === 'AMBIGUOUS') {
      report.skipped.push({ memberName, alias, reason: member ? 'member name is ambiguous' : 'member not found' })
      continue
    }

    const pubs = await payload.find({
      collection: 'publications',
      where: { 'authors.name': { equals: alias } },
      limit: 500,
      depth: 0,
    })

    let rows = 0
    for (const pub of pubs.docs) {
      const { authors, changed } = linkAliasInAuthors(pub.authors, alias, member.id)
      if (changed === 0) continue
      rows += changed
      if (apply) await payload.update({ collection: 'publications', id: pub.id, data: { authors } })
    }

    report.linked.push({ memberName, memberId: member.id, alias, publications: pubs.docs.length, rowsChanged: rows })
  }

  const reportPath = path.join(repoRoot, 'reports', `author-aliases-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  const total = report.linked.reduce((sum, entry) => sum + entry.rowsChanged, 0)
  console.log(`${report.mode}: ${total} author row(s) ${apply ? 'linked' : 'would be linked'}, ${report.skipped.length} skipped`)
  console.log(`report → ${reportPath}`)
}

await run()
```

- [ ] **Step 6: Add the npm scripts**

In `web/package.json`, beside the other script entries:

```json
    "authors:link-aliases": "cross-env NODE_OPTIONS=--no-deprecation payload run scripts/link-author-aliases.mjs",
    "authors:link-aliases:apply": "cross-env AUTHOR_ALIASES_APPLY=1 NODE_OPTIONS=--no-deprecation payload run scripts/link-author-aliases.mjs",
    "authors:aliases:test": "node --test scripts/tests/author-aliases.test.mjs",
```

- [ ] **Step 7: Dry run, apply, verify, prove idempotency**

```bash
cd web && pnpm authors:link-aliases
pnpm authors:link-aliases:apply
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "select count(member_id) as linked, count(*) as total from publications_authors;"
pnpm authors:link-aliases:apply
```

Expected: the dry run reports **40** rows would be linked (14+11+9+3+3+1+1 across eight members — read the report for the true split and record it); the apply links the same number; linked author rows rise from 394; the second apply reports 0 rows changed. **If the second run changes rows, the guard against re-linking is broken — fix it before committing.**

Then confirm the eight are no longer publication-less:

```bash
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "select m.name, count(pa.*) from members m join publications_authors pa on pa.member_id=m.id where m.name in ('Alexandre Francisco','Sara Madeira','Alexandra Carvalho','Pedro Monteiro','André Martins','Nuno Mendes','Pedro Stralen','Clara Pereira') group by 1 order by 2 desc;"
```

- [ ] **Step 8: Commit**

```bash
git add web/scripts/lib/author-aliases.mjs web/scripts/tests/author-aliases.test.mjs web/scripts/link-author-aliases.mjs web/package.json web/reports/
git commit -m "fix(data): link eight co-authors held under their academic name

Publications carry \"Alexandre P. Francisco\" where our member record says
\"Alexandre Francisco\", so eight members were authors of papers we already
hold without being linked to them. An explicit allowlist rather than a looser
matching rule: the author string \"Gonçalo Oliveira\" matches two of our
members, and a misattributed paper is worse than a missing one."
```

---

### Task 2: Extract the shared member presentation

**Files:**
- Create: `web/src/lib/member.ts`
- Create: `web/src/components/PersonLinks.tsx`
- Modify: `web/src/app/(frontend)/people/page.tsx`

**Interfaces:**
- Produces: `initials(name: string): string`, `memberPhotoUrl(member: Member): string | null`, `memberPhotoAlt(member: Member): string`, `visibleLinks(member: Member): { label: string; href: string }[]`, `memberSameAs(member: Member): string[]`, and `<PersonLinks member emailLabel websiteLabel />`.

The People page today owns all of this privately, and the profile page needs the same behaviour. Extracting it is what stops the two pages from drifting into showing a different person.

- [ ] **Step 1: Create the helper module**

Create `web/src/lib/member.ts`. Move the logic verbatim from `people/page.tsx` — `initials`, `visible`, `visibleValue`, `memberSameAs`, `memberPhoto` — and add the URL helper the pages need.

```ts
import type { Media, Member } from '@/payload-types'

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .join('')
    .toUpperCase()

// A field is shown only when it holds a value AND its toggle is not explicitly
// off. The toggles default to true, so `undefined` must read as visible.
const visible = (value: unknown, toggle?: boolean | null) => Boolean(value) && toggle !== false

const visibleValue = (value?: string | null, toggle?: boolean | null) =>
  visible(value, toggle) ? value : null

function memberPhoto(member: Member): Media | null {
  return member.photo && typeof member.photo === 'object' ? member.photo : null
}

export function memberPhotoUrl(member: Member): string | null {
  const photo = memberPhoto(member)
  return photo?.sizes?.thumbnail?.url || photo?.url || null
}

export function memberPhotoAlt(member: Member): string {
  return memberPhoto(member)?.alt || member.name
}

/** Every externally visible profile link, in the order the site shows them. */
export function visibleLinks(member: Member): { label: string; href: string }[] {
  const entries: ({ label: string; href: string | null | undefined } | null)[] = [
    { label: 'LinkedIn', href: visibleValue(member.links?.linkedin, member.showLinkedIn) },
    { label: 'GitHub', href: visibleValue(member.links?.github, member.showGitHub) },
    {
      label: 'ORCID',
      href: visible(member.orcid, member.showORCID) ? `https://orcid.org/${member.orcid}` : null,
    },
    {
      label: 'Ciencia Vitae',
      href: visible(member.cienciaId, member.showCienciaId)
        ? `https://www.cienciavitae.pt/${member.cienciaId}`
        : null,
    },
    {
      label: 'DBLP',
      href: visible(member.dblpKey, member.showDBLP) ? `https://dblp.org/pid/${member.dblpKey}` : null,
    },
    { label: 'Tecnico', href: visibleValue(member.links?.tecnicoPage, member.showTecnicoPage) },
    { label: 'Google Scholar', href: visibleValue(member.links?.googleScholar, member.showGoogleScholar) },
  ]

  return entries.filter((e): e is { label: string; href: string } => Boolean(e?.href))
}

/** schema.org sameAs: the same links, plus the personal page. */
export function memberSameAs(member: Member): string[] {
  const personal = visibleValue(member.links?.personalPage, member.showPersonalPage)
  return [...visibleLinks(member).map((l) => l.href), ...(personal ? [personal] : [])]
}

export function personalPageUrl(member: Member): string | null {
  return visibleValue(member.links?.personalPage, member.showPersonalPage) ?? null
}
```

- [ ] **Step 2: Create the links component**

Create `web/src/components/PersonLinks.tsx`:

```tsx
import React from 'react'
import type { Member } from '@/payload-types'
import { personalPageUrl, visibleLinks } from '@/lib/member'

// The labels of external services (LinkedIn, ORCID, …) are proper nouns and stay
// untranslated; only "Website" and "Email" are ours to word, so they arrive as props.
export function PersonLinks({
  member,
  emailLabel,
  websiteLabel,
}: {
  member: Member
  emailLabel: string
  websiteLabel: string
}) {
  const links = visibleLinks(member)
  const personal = personalPageUrl(member)
  const email = member.showEmail && member.email ? member.email : null

  if (links.length === 0 && !personal && !email) return null

  return (
    <div className="person-links">
      {links.map((link) => (
        <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      ))}
      {personal && (
        <a href={personal} target="_blank" rel="noreferrer">
          {websiteLabel}
        </a>
      )}
      {email && <a href={`mailto:${email}`}>{emailLabel}</a>}
    </div>
  )
}
```

- [ ] **Step 3: Point the People page at the extracted pieces**

In `web/src/app/(frontend)/people/page.tsx`, delete the local `initials`, `visible`, `visibleValue`, `memberSameAs`, `memberPhoto` and `PersonLinks` definitions, and import instead:

```ts
import { memberSameAs } from '@/lib/member'
```

Leave the rest of the page working as it does today — Task 3 rewrites the card. This step must not change what the page renders.

- [ ] **Step 4: Verify nothing moved**

```bash
cd web && pnpm typecheck
curl -s "http://localhost:3000/people" | grep -c "person-card"
```

Expected: typecheck clean; the card count is unchanged from before the edit (record the number you saw before editing).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/member.ts web/src/components/PersonLinks.tsx "web/src/app/(frontend)/people/page.tsx"
git commit -m "refactor(web): extract shared member presentation

The profile page needs the same photo, initials and visibility-aware links the
list card already builds privately. Extracting them is what keeps the two from
drifting into showing a different person."
```

---

### Task 3: Shrink the card and add the profile page

**Files:**
- Create: `web/src/components/PersonCard.tsx`
- Create: `web/src/app/(frontend)/people/[slug]/page.tsx`
- Modify: `web/src/app/(frontend)/people/page.tsx`
- Modify: `web/src/i18n/messages.ts`

**Interfaces:**
- Consumes: everything Task 2 produced.
- Produces: route `/people/[slug]`; `<PersonCard member roleBadge? />`.

- [ ] **Step 1: Add the dictionary entries**

In `web/src/i18n/messages.ts`, extend the existing `people` block in **`en`**:

```ts
    publicationsHead: 'Publications',
    supervisedHead: 'Dissertations supervised',
    authoredHead: 'Dissertation',
    backToPeople: '← All people',
    prevPage: '← Newer',
    nextPage: 'Older →',
    pageLabel: 'Page',
    pageOf: 'of',
```

and the same keys in **`pt`**:

```ts
    publicationsHead: 'Publicações',
    supervisedHead: 'Dissertações orientadas',
    authoredHead: 'Dissertação',
    backToPeople: '← Todas as pessoas',
    prevPage: '← Mais recentes',
    nextPage: 'Mais antigas →',
    pageLabel: 'Página',
    pageOf: 'de',
```

Keep `recentPublications` and `contactPending` for now — Task 4 removes them once nothing uses them.

- [ ] **Step 2: Write the card**

Create `web/src/components/PersonCard.tsx`:

```tsx
import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Member } from '@/payload-types'
import { initials, memberPhotoAlt, memberPhotoUrl } from '@/lib/member'

// Identification only: a photo, a name, a level. Everything else lives on the
// person's own page — the card carrying each member's links and bibliography is
// what turned a list of 113 people into a wall you had to read rather than scan.
export function PersonCard({ member, roleBadge }: { member: Member; roleBadge?: string }) {
  const photoUrl = memberPhotoUrl(member)

  const body = (
    <>
      {photoUrl ? (
        <Image
          className="person-avatar person-avatar--photo"
          src={photoUrl}
          alt={memberPhotoAlt(member)}
          width={44}
          height={44}
          loading="lazy"
        />
      ) : (
        <div className="person-avatar">{initials(member.name)}</div>
      )}
      <strong>{member.name}</strong>
      {roleBadge && <span className="badge">{roleBadge}</span>}
    </>
  )

  // A member with no slug has no address to link to; render the card inert rather
  // than pointing at a URL that 404s.
  if (!member.slug) return <div className="person-card">{body}</div>

  return (
    <Link className="person-card" href={`/people/${member.slug}`}>
      {body}
    </Link>
  )
}
```

- [ ] **Step 3: Use it and drop the bibliography from the list**

In `web/src/app/(frontend)/people/page.tsx`: delete the local `PersonCard`, import the new one, and remove the publications query and `memberPublicationMap` entirely — the list no longer needs publications, and loading 1000 of them per request to render three titles per card was the page's main cost.

The page keeps: the JSON-LD graph, the heading, the intro line, the role grouping and the two secondary status sections. Every `<PersonCard>` call passes only `member` and, in the secondary sections, `roleBadge`.

- [ ] **Step 4: Write the profile page**

Create `web/src/app/(frontend)/people/[slug]/page.tsx`:

```tsx
import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { Member } from '@/payload-types'
import { JsonLd } from '@/components/JsonLd'
import { PersonLinks } from '@/components/PersonLinks'
import { PubRow } from '@/components/PubRow'
import { DissertationRow } from '@/components/DissertationRow'
import { initials, memberPhotoAlt, memberPhotoUrl, memberSameAs } from '@/lib/member'
import { published } from '@/lib/queries'
import { SITE_URL } from '@/lib/site'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

const PER_PAGE = 25

type Params = Promise<{ slug: string }>
type SearchParams = Promise<{ page?: string }>

async function findMember(slug: string): Promise<Member | null> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'members',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] ?? null
}

export async function generateMetadata(props: { params: Params }) {
  const { slug } = await props.params
  const member = await findMember(slug)
  if (!member) return {}
  return {
    title: member.name,
    openGraph: { title: member.name, type: 'profile', url: `${SITE_URL}/people/${member.slug}` },
  }
}

export default async function PersonPage(props: { params: Params; searchParams: SearchParams }) {
  const { slug } = await props.params
  const { page } = await props.searchParams
  const t = await getDictionary()

  const member = await findMember(slug)
  if (!member) notFound()

  const payload = await getPayload({ config })
  const currentPage = Math.max(1, Number(page) || 1)

  const [publications, supervised, authored] = await Promise.all([
    payload.find({
      collection: 'publications',
      where: published({ 'authors.member': { equals: member.id } }),
      sort: '-year',
      limit: PER_PAGE,
      page: currentPage,
      depth: 1,
    }),
    payload.find({
      collection: 'dissertations',
      where: { 'supervisors.member': { equals: member.id } },
      sort: 'status',
      limit: 100,
      depth: 1,
    }),
    payload.find({
      collection: 'dissertations',
      where: { 'author.member': { equals: member.id } },
      sort: 'status',
      limit: 100,
      depth: 1,
    }),
  ])

  const photoUrl = memberPhotoUrl(member)
  const sameAs = memberSameAs(member)
  const interests = member.researchInterests ?? []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: member.name,
    ...(sameAs.length > 0 ? { sameAs } : {}),
    affiliation: { '@type': 'ResearchOrganization', name: 'MLKD, INESC-ID' },
  }

  const pageHref = (n: number) => (n > 1 ? `/people/${member.slug}?page=${n}` : `/people/${member.slug}`)

  return (
    <article>
      <JsonLd data={jsonLd} />
      <div className="article-head person-head">
        {photoUrl ? (
          <Image
            className="person-photo"
            src={photoUrl}
            alt={memberPhotoAlt(member)}
            width={120}
            height={120}
            priority
          />
        ) : (
          <div className="person-photo person-photo--initials">{initials(member.name)}</div>
        )}
        <div>
          <h1>{member.name}</h1>
          <p className="pub-meta">
            <span className="badge">{t.people[`role${member.role === 'phd' ? 'Phd' : member.role === 'msc' ? 'Msc' : member.role === 'faculty' ? 'Faculty' : member.role === 'researcher' ? 'Researchers' : 'Alumni'}`]}</span>
            {member.membershipStatus && member.membershipStatus !== 'active' ? (
              <>
                {' '}
                <span className="badge">
                  {member.membershipStatus === 'suspended' ? t.people.statusSuspended : t.people.statusCompleted}
                </span>
              </>
            ) : null}
          </p>
          {interests.length > 0 && <p className="pub-meta">{interests.join(' · ')}</p>}
          <PersonLinks member={member} emailLabel={t.people.email} websiteLabel={t.people.website} />
        </div>
      </div>

      {member.bio ? (
        <section className="rich-text">
          <RichText data={member.bio} />
        </section>
      ) : null}

      {publications.totalDocs > 0 && (
        <section>
          <h2>{t.people.publicationsHead}</h2>
          {publications.docs.map((pub) => (
            <PubRow key={pub.id} pub={pub} />
          ))}
          {publications.totalPages > 1 && (
            <nav className="pager" aria-label={t.people.publicationsHead}>
              {publications.hasPrevPage ? (
                <Link className="btn btn-quiet" href={pageHref(currentPage - 1)}>
                  {t.people.prevPage}
                </Link>
              ) : (
                <span />
              )}
              <span className="mono">
                {t.people.pageLabel} {currentPage} {t.people.pageOf} {publications.totalPages}
              </span>
              {publications.hasNextPage ? (
                <Link className="btn btn-quiet" href={pageHref(currentPage + 1)}>
                  {t.people.nextPage}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      )}

      {authored.docs.length > 0 && (
        <section>
          <h2>{t.people.authoredHead}</h2>
          {authored.docs.map((item) => (
            <DissertationRow key={item.id} item={item} />
          ))}
        </section>
      )}

      {supervised.docs.length > 0 && (
        <section>
          <h2>{t.people.supervisedHead}</h2>
          {supervised.docs.map((item) => (
            <DissertationRow key={item.id} item={item} />
          ))}
        </section>
      )}

      <p style={{ marginTop: '2.5rem' }}>
        <Link href="/people">{t.people.backToPeople}</Link>
      </p>
    </article>
  )
}
```

> The role-badge expression above is dense. If the implementer prefers, replace it
> with a small lookup constant `const ROLE_KEY = { faculty: 'roleFaculty', researcher: 'roleResearchers', phd: 'rolePhd', msc: 'roleMsc', alumni: 'roleAlumni' } as const` and index it — same behaviour, easier to read. Prefer the lookup.

- [ ] **Step 5: Add the profile-page styles**

In `web/src/app/(frontend)/styles.css`, after the `.person-card` rules:

```css
/* Profile header: photo beside the name, stacking on narrow screens */
.person-head {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.person-photo {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--ink-12);
}

.person-photo--initials {
  display: grid;
  place-items: center;
  font-family: var(--font-serif, georgia, serif);
  font-size: 2.2rem;
  color: var(--ink-40);
  background: var(--ink-6);
}
```

Also make the card a proper link target — add to the existing `.person-card` block:

```css
.person-card {
  display: block;
  color: inherit;
}
```

- [ ] **Step 6: Verify**

With the dev server running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/people"
SLUG=$(docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -t -A -c "select slug from members where id=1;")
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/people/$SLUG"
curl -s "http://localhost:3000/people/$SLUG" | grep -o "Page 1 of [0-9]*"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/people/no-such-person"
curl -s -H "Cookie: NEXT_LOCALE=pt" "http://localhost:3000/people/$SLUG" | grep -o "Publicações\|Página"
curl -s "http://localhost:3000/people" | grep -c "person-publications"
```

Expected: `/people` 200; the profile 200 and its pager reads `Page 1 of 11` (252 publications at 25 a page); unknown slug 404; the Portuguese strings present; and **zero** `person-publications` blocks left on the list.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/PersonCard.tsx "web/src/app/(frontend)/people" web/src/i18n/messages.ts "web/src/app/(frontend)/styles.css"
git commit -m "feat(web): give every member a profile page

The list card now identifies a person and nothing more; their links, bibliography
and dissertations move to /people/[slug]. The list also stops loading 1000
publications per request to render three titles per card."
```

---

### Task 4: Migrate the anchors, the sitemap and the leftovers

**Files:**
- Modify: `web/src/components/PubRow.tsx`, `web/src/components/DissertationRow.tsx`, `web/src/components/MemberAvatarStack.tsx`
- Modify: `web/src/app/(frontend)/publications/[slug]/page.tsx`, `web/src/app/(frontend)/dissertations/[slug]/page.tsx`, `web/src/app/(frontend)/search/page.tsx`
- Modify: `web/src/app/sitemap.ts`, `web/src/i18n/messages.ts`, `ai/app/rag/retriever.py`

**Interfaces:**
- Consumes: route `/people/[slug]` from Task 3.
- Produces: no new exports. After this task `pnpm typecheck` and `pnpm build` must be clean.

- [ ] **Step 1: Find every reference**

```bash
cd .. && grep -rn "people#" web/src ai/app --include=*.ts --include=*.tsx --include=*.py
```

Work through everything it lists; the steps below cover the known ones.

- [ ] **Step 2: Rewrite the links**

In each of `PubRow.tsx`, `DissertationRow.tsx`, `publications/[slug]/page.tsx` and `dissertations/[slug]/page.tsx`, the author/supervisor link changes from

```tsx
<Link className="author-member-link" href={`/people#${member.slug}`}>
```

to

```tsx
<Link className="author-member-link" href={`/people/${member.slug}`}>
```

In `MemberAvatarStack.tsx`:

```tsx
href={m.slug ? `/people/${m.slug}` : '/people'}
```

In `search/page.tsx`, the `members` entry of `ENTITY_LINK`:

```ts
  members: (hit) => (hit.slug ? `/people/${hit.slug}` : '/people'),
```

In `ai/app/rag/retriever.py`, if `_url` emits a people URL with a fragment, make it a path segment the same way.

- [ ] **Step 3: Drop the dead anchor and the dead keys**

In `people/page.tsx` the cards no longer need `id={member.slug}` — Task 3's `PersonCard` already omits it, so confirm nothing else sets it.

Remove `recentPublications` and `contactPending` from the `people` block in **both** locales in `web/src/i18n/messages.ts`; nothing renders them now. TypeScript will flag any remaining use.

- [ ] **Step 4: Add profiles to the sitemap**

In `web/src/app/sitemap.ts`, add a members query beside the others:

```ts
    payload.find({
      collection: 'members',
      limit: 1000,
      depth: 0,
      select: { slug: true, updatedAt: true },
    }),
```

destructure it as `members`, and spread its URLs into the returned array:

```ts
    ...members.docs
      .filter((d) => d.slug)
      .map((d) => ({
        url: `${SITE_URL}/people/${d.slug}`,
        lastModified: d.updatedAt ? new Date(d.updatedAt) : undefined,
        changeFrequency: 'monthly' as const,
      })),
```

- [ ] **Step 5: Full verification**

```bash
cd web && pnpm typecheck && pnpm lint && pnpm build && pnpm scripts:test
```

Expected: typecheck clean; lint shows **only** the 3 pre-existing errors in `ThemeToggle.tsx` and `TopicMapChart.tsx`; build lists `/people/[slug]`; all script tests pass.

Then, with the dev server running:

```bash
grep -rn "people#" web/src ai/app --include=*.ts --include=*.tsx --include=*.py | wc -l   # expect 0
curl -s "http://localhost:3000/publications" | grep -o 'href="/people/[a-z0-9-]*"' | head -3
curl -s "http://localhost:3000/sitemap.xml" | grep -c "/people/"
```

Expected: no `people#` left anywhere; author links point at profile routes; the sitemap carries a URL per member with a slug.

- [ ] **Step 6: Commit**

```bash
git add -A web/src ai/app
git commit -m "feat(web): point member links at profile pages

Author names, supervisor names, avatar stacks and search hits led to an anchor
on a 113-card list; they now open the person. Adds profiles to the sitemap and
drops the two dictionary keys the old card used."
```

---

## Self-Review

**Spec coverage.** Spec §3 (link eight co-authors) → Task 1. §4 (list card) → Tasks 2–3. §5 (profile page) → Task 3. §6 (anchor migration) → Task 4. §7 (sitemap) → Task 4 Step 4. §8 (i18n both locales) → Task 3 Step 1 and Task 4 Step 3. §9 out-of-scope items appear in no task, as intended.

**Placeholders.** None: every code step carries its implementation, and every verification step names the command and the expected result. The one judgement call — the role-badge expression in Task 3 Step 4 — states the preferred alternative explicitly rather than leaving it open.

**Type consistency.** `initials`, `memberPhotoUrl`, `memberPhotoAlt`, `memberSameAs`, `visibleLinks`, `personalPageUrl` are defined in Task 2 and used with those names in Tasks 2 and 3. `PersonLinks` takes `member`, `emailLabel`, `websiteLabel` in both its definition and its two call sites. `PersonCard` takes `member` and optional `roleBadge` in Task 3's definition and in the list page. `linkAliasInAuthors(authors, alias, memberId) → { authors, changed }` matches between Task 1's library, its tests and its driver. Dictionary keys added in Task 3 Step 1 are exactly those read by the profile page.

**One risk worth naming.** Task 3's publications query filters on `authors.member`, a field inside an array. Payload supports this, but if the query returns nothing for member id 1 — who is on all 252 publications — the query shape is wrong, not the data. Verify against that member first, as Step 6 does.
