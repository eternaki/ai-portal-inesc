# Publications Histogram and /research Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 35 year chips on `/publications` with a clickable histogram that is also readable as information, and retire `/research`, whose four themes have no descriptions and no linked publications.

**Architecture:** The histogram is a Server Component emitting inline SVG — no client JS, no charting library. Every bar is an `<a href="/publications?year=YYYY">`, so filtering works exactly as the chips did. `/research` is deleted; its four theme names move to the homepage tiles they already feed, and the `research-themes` collection loses the two fields nothing renders any more.

**Tech Stack:** Next.js 16 App Router + Payload CMS 3 (TypeScript), inline SVG, PostgreSQL.

## Global Constraints

- **Site languages are English and Português only. No Russian may appear in the UI.** Every visible string goes through `web/src/i18n/messages.ts` in **both** `en` and `pt`; `en` defines the type and `pt` must satisfy it, so a missing key is a compile error.
- **Code, comments, docs and commit messages in English.** Comments explain what, why, and why this way.
- Small, single-purpose files. Follow existing patterns; match the surrounding code.
- Public pages are **Server Components**. Do not add `'use client'`.
- Never name a `.map()`/`.filter()` callback parameter `t` — it shadows the dictionary.
- After any collection change run `pnpm generate:types`.
- Migrations are hand-written SQL in the style of `web/src/migrations/*.ts`, registered in `web/src/migrations/index.ts`, with a working `down`.
- Verification: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm scripts:test`. **`pnpm lint` reports 3 pre-existing errors** in `ThemeToggle.tsx` and `TopicMapChart.tsx` — not yours; add none.

## Reference facts (measured 2026-08-11, do not re-derive)

Published publications per year — 252 across 35 distinct years, **1994 has none**:

```
1991:1  1992:1  1993:1  1995:1  1996:3  1997:1  1998:4  1999:2  2000:6
2001:2  2002:11 2003:11 2004:15 2005:7  2006:10 2007:16 2008:17 2009:11
2010:10 2011:14 2012:2  2013:2  2014:1  2015:1  2016:4  2017:14 2018:7
2019:2  2020:1  2021:9  2022:12 2023:18 2024:14 2025:13 2026:8
```

Peak is 18 (2023). `research-themes` holds 4 rows; `research_themes_rels` holds 1 row in total.

**Colour, already validated** with the dataviz skill's `validate_palette.js` — do not substitute other values:

| Mode | Bar | Surface | Result |
|---|---|---|---|
| light | `#2553a5` | `#f6f7f4` | all checks pass |
| dark | `#6b93e2` | `#10131a` | all checks pass |

One series, so **one hue and no legend**. Selection is carried by a second channel — an outline ring plus a visible year label — never by a second colour. Encoding selection as a second blue was tried and rejected: in dark mode the lightness band is L 0.48–0.67, and two blues inside it either fail the normal-vision separation floor (ΔE 11.8 against a minimum of 15) or fall below the chroma floor.

## File Structure

**Create**
- `web/src/components/YearHistogram.tsx` — the SVG filter control
- `web/src/migrations/20260811_120000_research_theme_fields.ts`

**Modify**
- `web/src/app/(frontend)/publications/page.tsx` — swap the year chips for the histogram
- `web/src/app/(frontend)/styles.css` — histogram styles
- `web/src/i18n/messages.ts` — histogram + homepage strings, both locales
- `web/src/app/(frontend)/page.tsx` — theme tiles stop linking to `/research`
- `web/src/collections/ResearchThemes.ts` — drop `members` and `keyPublications`
- `web/src/app/sitemap.ts` — drop `/research`

**Delete**
- `web/src/app/(frontend)/research/page.tsx`

---

### Task 1: The year histogram

**Files:**
- Create: `web/src/components/YearHistogram.tsx`
- Modify: `web/src/app/(frontend)/publications/page.tsx`, `web/src/app/(frontend)/styles.css`, `web/src/i18n/messages.ts`

**Interfaces:**
- Produces: `<YearHistogram counts={{ year: number; count: number }[]} activeYear={string | undefined} hrefForYear={(year: string | null) => string} labels={{ allYears, aria, tableToggle, yearColumn, countColumn, publications }} />`

- [ ] **Step 1: Add the dictionary entries**

In `web/src/i18n/messages.ts`, add to the `publications` block in **`en`**:

```ts
    histogramAria: 'Publications per year — select a year to filter',
    histogramTable: 'Years as a table',
    yearColumn: 'Year',
    countColumn: 'Publications',
```

and in **`pt`**:

```ts
    histogramAria: 'Publicações por ano — selecione um ano para filtrar',
    histogramTable: 'Anos em tabela',
    yearColumn: 'Ano',
    countColumn: 'Publicações',
```

- [ ] **Step 2: Write the component**

Create `web/src/components/YearHistogram.tsx`:

```tsx
import React from 'react'
import Link from 'next/link'

// A filter that is also information. Thirty-five year chips wrapped to three rows
// and said nothing; the same width as a bar chart shows the group's output over
// time — the 2004-2011 run, the 2012-2016 dip, the recovery after 2021 — while
// staying exactly as clickable as the chips were.
//
// One series, so one hue and no legend. Selection is an outline ring plus a
// visible label, never a second colour: in dark mode two blues inside the
// permitted lightness band fail the colour-vision separation floor.
//
// Server-rendered SVG, no client JS: every bar is a link, so filtering works with
// JavaScript disabled exactly as the chips did.

const HEIGHT = 72
const CELL = 30
const BAR = 16
const RADIUS = 4

export type YearCount = { year: number; count: number }

export function YearHistogram({
  counts,
  activeYear,
  hrefForYear,
  labels,
}: {
  counts: YearCount[]
  activeYear?: string
  hrefForYear: (year: string | null) => string
  labels: {
    allYears: string
    aria: string
    table: string
    yearColumn: string
    countColumn: string
  }
}) {
  if (counts.length === 0) return null

  const byYear = new Map(counts.map((c) => [c.year, c.count]))
  const first = Math.min(...byYear.keys())
  const last = Math.max(...byYear.keys())
  // Every year in the span gets a cell, including those with no publications:
  // skipping them would compress the gaps and make the shape lie about the years
  // the group published nothing.
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const peak = Math.max(...byYear.values())

  const width = years.length * CELL

  return (
    <div className="year-histogram">
      <div className="year-histogram-head">
        <Link href={hrefForYear(null)} className={activeYear ? '' : 'active'}>
          {labels.allYears}
        </Link>
        {activeYear && (
          <span className="mono year-histogram-selected">
            {activeYear} · {byYear.get(Number(activeYear)) ?? 0}
          </span>
        )}
      </div>

      <svg
        className="year-histogram-svg"
        viewBox={`0 0 ${width} ${HEIGHT + 18}`}
        role="group"
        aria-label={labels.aria}
        preserveAspectRatio="none"
      >
        {years.map((year, index) => {
          const count = byYear.get(year) ?? 0
          const x = index * CELL
          const barHeight = count === 0 ? 0 : Math.max(3, Math.round((count / peak) * HEIGHT))
          const selected = String(year) === activeYear

          if (count === 0) {
            return (
              <rect
                key={year}
                x={x + (CELL - BAR) / 2}
                y={HEIGHT - 1}
                width={BAR}
                height={1}
                className="year-histogram-empty"
              />
            )
          }

          return (
            <Link key={year} href={hrefForYear(String(year))} aria-label={`${year}: ${count}`}>
              {/* The hit area spans the whole cell, not the bar: a one-publication
                  year is a 3px sliver nobody can click. */}
              <rect x={x} y={0} width={CELL} height={HEIGHT + 18} className="year-histogram-hit" />
              <rect
                x={x + (CELL - BAR) / 2}
                y={HEIGHT - barHeight}
                width={BAR}
                height={barHeight}
                rx={Math.min(RADIUS, barHeight)}
                className={`year-histogram-bar${selected ? ' is-selected' : ''}`}
              />
            </Link>
          )
        })}

        {/* Only the ends of the scale are labelled; a number under every bar is
            noise, and the selected year is already named above the chart. */}
        <text x={0} y={HEIGHT + 14} className="year-histogram-tick">
          {first}
        </text>
        <text x={width} y={HEIGHT + 14} textAnchor="end" className="year-histogram-tick">
          {last}
        </text>
      </svg>

      {/* A value must not be reachable by hover alone. */}
      <details className="year-histogram-details">
        <summary>{labels.table}</summary>
        <table className="year-histogram-table">
          <thead>
            <tr>
              <th>{labels.yearColumn}</th>
              <th>{labels.countColumn}</th>
            </tr>
          </thead>
          <tbody>
            {counts
              .slice()
              .sort((a, b) => b.year - a.year)
              .map((entry) => (
                <tr key={entry.year}>
                  <td>
                    <Link href={hrefForYear(String(entry.year))}>{entry.year}</Link>
                  </td>
                  <td className="mono">{entry.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
```

- [ ] **Step 3: Add the styles**

In `web/src/app/(frontend)/styles.css`, after the `.filters` rules:

```css
/* ── publications: year histogram ── */

.year-histogram {
  margin: 1.1rem 0 1.4rem;
}

.year-histogram-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.4rem;
}

.year-histogram-head a {
  font-family: var(--font-mono, Menlo, monospace);
  font-size: 0.78rem;
  padding: 0.15rem 0.65rem;
  border: 1px solid var(--ink-12);
  border-radius: 999px;
  color: var(--ink-70);
  background: var(--card);
}

.year-histogram-head a.active,
.year-histogram-head a:hover {
  border-color: var(--cobalt);
  color: var(--cobalt);
  background: var(--cobalt-wash);
  text-decoration: none;
}

.year-histogram-selected {
  font-size: 0.78rem;
  color: var(--ink-70);
}

.year-histogram-svg {
  display: block;
  width: 100%;
  height: 90px;
}

/* Single series, single hue — validated against the page surface in both themes. */
.year-histogram-bar {
  fill: #2553a5;
  transition: fill 160ms var(--ease);
}

:root[data-theme='dark'] .year-histogram-bar {
  fill: #6b93e2;
}

/* Selection is an outline, not a second colour. When a year is chosen the rest
   drop to neutral so the choice reads at a glance. */
.year-histogram:has(.is-selected) .year-histogram-bar {
  fill: var(--ink-40);
}

.year-histogram .year-histogram-bar.is-selected {
  fill: #2553a5;
  stroke: var(--ink);
  stroke-width: 1.5;
  paint-order: stroke;
}

:root[data-theme='dark'] .year-histogram .year-histogram-bar.is-selected {
  fill: #6b93e2;
}

.year-histogram-empty {
  fill: var(--ink-12);
}

.year-histogram-hit {
  fill: transparent;
}

.year-histogram-svg a:hover .year-histogram-bar {
  fill: var(--cobalt-bright);
}

.year-histogram-svg a:focus-visible .year-histogram-hit {
  fill: var(--cobalt-wash);
}

.year-histogram-tick {
  fill: var(--ink-40);
  font-family: var(--font-mono, Menlo, monospace);
  font-size: 11px;
}

.year-histogram-details {
  margin-top: 0.5rem;
  font-size: 0.82rem;
  color: var(--ink-70);
}

.year-histogram-details summary {
  cursor: pointer;
}

.year-histogram-table {
  border-collapse: collapse;
  margin-top: 0.5rem;
}

.year-histogram-table th,
.year-histogram-table td {
  padding: 0.15rem 0.9rem 0.15rem 0;
  text-align: left;
  font-weight: 400;
}

.year-histogram-table th {
  color: var(--ink-40);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
```

- [ ] **Step 4: Use it on the publications page**

In `web/src/app/(frontend)/publications/page.tsx`:

Import the component, and change the facet query so it returns per-year counts rather than a bare year list. Replace the `.then(...)` block on the second query with:

```ts
      .then((r) => {
        const perYear = new Map<number, number>()
        for (const doc of r.docs) {
          if (!doc.year) continue
          perYear.set(doc.year, (perYear.get(doc.year) ?? 0) + 1)
        }
        return {
          years: Array.from(perYear, ([year, count]) => ({ year, count })).sort(
            (a, b) => a.year - b.year,
          ),
          types: PUB_TYPES.filter((candidate) => r.docs.some((d) => d.type === candidate)),
        }
      }),
```

Then replace the entire year `<div className="filters">…</div>` block with:

```tsx
      <YearHistogram
        counts={facets.years}
        activeYear={activeYear}
        hrefForYear={(year) => hrefWith({ year, page: 1 })}
        labels={{
          allYears: t.publications.allYears,
          aria: t.publications.histogramAria,
          table: t.publications.histogramTable,
          yearColumn: t.publications.yearColumn,
          countColumn: t.publications.countColumn,
        }}
      />
```

The type filter row below it stays exactly as it is — four options is what chips are for.

- [ ] **Step 5: Verify**

```bash
cd web && pnpm typecheck
```

Then with the dev server running:

```bash
curl -s "http://localhost:3000/publications" -o /tmp/h.html
grep -c "year-histogram-bar" /tmp/h.html                     # expect 35 bars (one per year with publications)
grep -o 'href="/publications?year=[0-9]*"' /tmp/h.html | sort -u | wc -l   # expect 35
grep -o 'aria-label="2023: 18"' /tmp/h.html | head -1          # the peak year, labelled
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/publications?year=1991"
curl -s "http://localhost:3000/publications?year=1991" | grep -o "is-selected" | head -1
curl -s -H "Cookie: NEXT_LOCALE=pt" "http://localhost:3000/publications" | grep -o "Anos em tabela"
```

Expected: 35 bars, 35 distinct year links, the peak bar carries its count in its label, 1991 filters and marks itself selected, and the Portuguese table label renders.

**Then look at it.** The validator checks colour, not layout. Take a screenshot or open the page and confirm the bars do not collide with the tick labels and the chart does not overflow its container at a narrow width.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/YearHistogram.tsx "web/src/app/(frontend)/publications/page.tsx" "web/src/app/(frontend)/styles.css" web/src/i18n/messages.ts
git commit -m "feat(web): replace the year chips with a histogram

Thirty-five chips wrapped to three rows and carried no information beyond their
own labels. The same width as a bar chart shows the group's output over time and
filters exactly as the chips did — every bar is a link, so it works without
JavaScript. One hue, selection by outline: two blues inside dark mode's lightness
band fail the colour-vision separation floor."
```

---

### Task 2: Retire /research

**Files:**
- Delete: `web/src/app/(frontend)/research/page.tsx`
- Modify: `web/src/app/(frontend)/page.tsx`, `web/src/app/sitemap.ts`, `web/src/i18n/messages.ts`, `web/src/collections/ResearchThemes.ts`
- Create: `web/src/migrations/20260811_120000_research_theme_fields.ts`
- Modify: `web/src/migrations/index.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: no new exports. After this task `pnpm typecheck` and `pnpm build` must be clean and no route `/research` exists.

- [ ] **Step 1: Delete the page and its links**

```bash
rm "web/src/app/(frontend)/research/page.tsx"
```

In `web/src/app/(frontend)/page.tsx`, the theme tiles currently link into the deleted page. Remove the section's "All themes →" link entirely, and make each tile's name plain text rather than a link:

```tsx
          <div className="section-head">
            <h2>{t.home.themesHead}</h2>
          </div>
```

and inside the tile, replace the `<Link href={`/research#${theme.slug}`}>` wrapper with just `{theme.name}`.

Keep the `keyPublications` count line only if the theme still has one — after Task 2 Step 3 that field is gone, so **delete the count line as well**: `pubCount` and the `theme-tile-count` span go with it.

In `web/src/app/sitemap.ts` remove `'/research'` from the statics list.

In `web/src/i18n/messages.ts` delete the whole `research` block from **both** locales, and delete `home.allThemes`, `home.themePub` and `home.themePubs`, which nothing renders now. TypeScript will flag anything still referencing them.

- [ ] **Step 2: Trim the collection**

In `web/src/collections/ResearchThemes.ts` remove the `members` and `keyPublications` relationship fields. `name`, `slug` and `description` stay: the description becomes the caption under each homepage tile.

A field an editor fills that appears on no page is exactly the maintenance trap the brief warns about — that is why these two go rather than being left "for later".

- [ ] **Step 3: Show the description on the homepage tile**

In `web/src/app/(frontend)/page.tsx`, the themes query currently uses `depth: 0`; keep it, and render the description under the name when present. Payload rich text needs the renderer:

```tsx
import { RichText } from '@payloadcms/richtext-lexical/react'
```

and in the tile:

```tsx
                  {theme.description ? (
                    <div className="rich-text theme-tile-desc">
                      <RichText data={theme.description} />
                    </div>
                  ) : null}
```

Add to `web/src/app/(frontend)/styles.css`:

```css
.theme-tile-desc {
  font-size: 0.88rem;
  color: var(--ink-70);
}
```

- [ ] **Step 4: Write the migration**

Create `web/src/migrations/20260811_120000_research_theme_fields.ts`:

```ts
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// /research is gone, and with it the only page that rendered a theme's members or
// its key publications. The relationship rows go too: a field an editor fills that
// appears nowhere is worse than no field.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "research_themes_rels" WHERE "path" IN ('members', 'keyPublications');
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The rows cannot be recreated — they recorded editorial choices, not derived
  // data. Restoring the fields in the collection config is enough to start
  // capturing them again.
  await db.execute(sql`SELECT 1;`)
}
```

Register it in `web/src/migrations/index.ts` following the existing pattern, with the name matching the filename exactly.

- [ ] **Step 5: Verify**

```bash
cd web && pnpm generate:types && pnpm typecheck && pnpm payload migrate
docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -c "select path, count(*) from research_themes_rels group by 1;"
pnpm build
```

Expected: typecheck clean; the migration runs; `research_themes_rels` has no `members` or `keyPublications` rows; the build lists no `/research` route.

Then with the dev server running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/research"      # expect 404
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/"              # expect 200
curl -s "http://localhost:3000/" | grep -o "Machine Learning for Health"       # the tile still renders
curl -s "http://localhost:3000/sitemap.xml" | grep -c "/research"              # expect 0
grep -rn "/research" web/src --include=*.tsx --include=*.ts | grep -v migrations   # expect nothing
```

- [ ] **Step 6: Commit**

```bash
git add -A web/src
git commit -m "feat(web): retire /research, keep the themes on the homepage

Four themes, every description empty, one member link, zero key publications —
the page only looked populated because it fell back to semantic search over the
theme name. The group's own site has no such section either; it states the
mission on the homepage, which is where the four names now live.

Drops the two theme fields nothing renders any more rather than leaving them for
an editor to fill into a void."
```

---

## Self-Review

**Spec coverage.** Legacy-parity spec §7 (histogram, validated colours, marks, no-JS filtering, table twin) → Task 1. §2 (`/research` deleted, themes to the homepage, `research-themes` loses `members` and `keyPublications`) → Task 2. Open positions (§6) is deliberately not here — it is the next plan.

**Placeholders.** None: every code step carries its implementation and every verification step names the command and the expected result.

**Type consistency.** `YearHistogram` takes `counts`, `activeYear`, `hrefForYear`, `labels` in its definition and at its single call site; `YearCount` is `{ year, count }` in the component and in the facet query that feeds it. The four new dictionary keys added in Task 1 Step 1 are exactly the four read in Step 4.

**One risk worth naming.** Task 1's `.year-histogram:has(.is-selected)` uses the CSS `:has()` selector to grey the unselected bars. It is supported in every current browser, but if it fails the chart still works — bars stay brand-coloured and the selected one keeps its outline and its label. The fallback is degraded, not broken, which is why it is acceptable here.
