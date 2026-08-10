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
