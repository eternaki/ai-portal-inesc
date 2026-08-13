/**
 * Import the group's dissertations from its legacy site into Payload.
 *
 * Run:  pnpm dissertations:import          (dry run, writes a report)
 *       pnpm dissertations:import:apply    (writes to the database)
 *
 * Writes through Payload's Local API via `payload run`, so arrays, relationships
 * and richText are built by Payload itself — no SQL, and no API key needed.
 *
 * Idempotent: an existing record is matched on title and updated rather than
 * duplicated. Title, not fenixUrl, is the key — see the note above the
 * `where` clause below for why.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import { hiddenClassNames, parseDissertationPage } from './lib/dissertation-parser.mjs'
import { firstLastKey, normalizeName } from './lib/member-importer.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const BASE = 'https://mlkd.idss.inesc-id.pt'

// Expected counts, measured 2026-08-10 and corrected 2026-08-13. The parser reads
// generated markup with regexes, so its failure mode is silent under-matching.
// Asserting the counts turns "the site was redesigned" into a loud error instead
// of an import that quietly drops half the archive.
//
// The open page counts 12, not the 13 blocks in its HTML: the builder leaves
// retired entries in the markup and hides them in CSS, so each page's stylesheet
// is fetched alongside it and anything switched off there is skipped.
const PAGES = [
  {
    url: `${BASE}/mlkd-dissertations-new.html`,
    css: `${BASE}/mlkd-dissertations-new.css`,
    status: 'open',
    expected: 12,
  },
  {
    url: `${BASE}/mlkd-dissertations-ongoing.html`,
    css: `${BASE}/mlkd-dissertations-ongoing.css`,
    status: 'ongoing',
    expected: 7,
  },
  {
    url: `${BASE}/mlkd-dissertations-finished.html`,
    css: `${BASE}/mlkd-dissertations-finished.css`,
    status: 'finished',
    expected: 39,
  },
]

// `payload run <script> --apply` does NOT forward `--apply` into the script's
// process.argv: payload's bin parses argv with minimist, so a `--flag` is
// consumed as a minimist option and only the *positional* args survive into
// the re-exec'd argv (verified against the installed payload version). The env
// var is therefore the reliable channel through `payload run`; the argv check
// stays so `node scripts/import-dissertations.mjs --apply` also works directly.
const apply = process.argv.includes('--apply') || process.env.DISSERTATIONS_APPLY === '1'

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
    const hidden = hiddenClassNames(await fetchPage(page.css))
    const rows = parseDissertationPage(html, {
      status: page.status,
      sourceUrl: page.url,
      hidden,
    })
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
    duplicateFenixUrls: [],
    errors: [],
  }

  // Only 30 of 59 legacy entries even have a fenixUrl (1 open, 29 finished, 0
  // ongoing), so it can never be a primary key on its own — and it has
  // already been observed to be actively wrong: two unrelated entries can
  // share one Fenix link (an open topic pointing at someone else's defended
  // thesis, a copy-paste error on the legacy site). Surface every such
  // collision so the group can be told, without letting it affect matching.
  const byFenixUrl = new Map()
  for (const row of parsed) {
    if (!row.fenixUrl) continue
    if (!byFenixUrl.has(row.fenixUrl)) byFenixUrl.set(row.fenixUrl, [])
    byFenixUrl.get(row.fenixUrl).push(row.title)
  }
  for (const [url, titles] of byFenixUrl) {
    if (titles.length > 1) report.duplicateFenixUrls.push({ url, titles })
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

    // Title is the only identity the source reliably provides: all 59 titles
    // are unique, but fenixUrl is absent from half the entries and — per
    // duplicateFenixUrls above — is not even unique when present. Matching on
    // it caused one entry to silently overwrite an unrelated one that shared
    // its (wrong) Fenix link. Trade-off: a dissertation whose title is edited
    // on the legacy site between runs would be re-created rather than
    // updated, which is far cheaper than the silent-overwrite failure mode.
    const where = { title: { equals: row.title } }
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
      `duplicate fenixUrls ${report.duplicateFenixUrls.length}, errors ${report.errors.length}`,
  )
  console.log(`report → ${reportPath}`)
}

await run()
