/**
 * Import the group's reading-group log from its legacy events page.
 *
 * Run:  pnpm events:import                     (dry run, writes a report)
 *       EVENTS_APPLY=1 pnpm events:import:apply
 *
 * The legacy site has no reading-groups section: its Events page *is* the log —
 * 83 meetings since March 2022, each a paper, its presenter and a link to it.
 * That is why this portal has no reading-groups collection either; the meetings
 * live in `events`, and the nav points at the Técnico page that runs them.
 *
 * Writes through Payload's Local API under `payload run`, so no API key is needed.
 *
 * Idempotent: a meeting is matched on title *and* date. Title alone would collapse
 * the two occasions the group discussed the same paper into one record.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import { parseLegacyEventsPage } from './lib/legacy-events-parser.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const SOURCE = 'https://mlkd.idss.inesc-id.pt/mlkd-events.html'

// Measured 2026-08-13. The parser reads generated markup, so its failure mode is
// silent under-matching — a quarter of the entries space their tags differently,
// and a stricter reader saw 63 of these without erroring.
const EXPECTED_EVENTS = 83

const apply = process.env.EVENTS_APPLY === '1'

async function run() {
  const payload = await getPayload({ config })

  const res = await fetch(SOURCE, { headers: { 'user-agent': 'mlkd-portal-importer' } })
  if (!res.ok) throw new Error(`GET ${SOURCE} → ${res.status}`)
  const meetings = parseLegacyEventsPage(await res.text())

  if (meetings.length !== EXPECTED_EVENTS) {
    throw new Error(
      `parsed ${meetings.length} meetings, expected ${EXPECTED_EVENTS}. ` +
        `The legacy markup probably changed — fix the parser before importing.`,
    )
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    source: SOURCE,
    parsed: meetings.length,
    created: [],
    updated: [],
    skippedNoDate: [],
    errors: [],
  }

  for (const meeting of meetings) {
    // `date` is required on the collection, so a meeting whose date we could not
    // read is reported rather than invented.
    if (!meeting.date) {
      report.skippedNoDate.push({ title: meeting.title, speaker: meeting.speaker })
      continue
    }

    const data = {
      title: meeting.title,
      date: new Date(`${meeting.date}T12:00:00Z`).toISOString(),
      speaker: meeting.speaker ?? undefined,
      link: meeting.link ?? undefined,
    }

    try {
      const existing = await payload.find({
        collection: 'events',
        where: { and: [{ title: { equals: meeting.title } }, { date: { equals: data.date } }] },
        limit: 1,
        depth: 0,
      })

      if (existing.docs[0]) {
        if (apply) await payload.update({ collection: 'events', id: existing.docs[0].id, data })
        report.updated.push({ id: existing.docs[0].id, title: meeting.title, date: meeting.date })
      } else {
        if (apply) await payload.create({ collection: 'events', data })
        report.created.push({ title: meeting.title, date: meeting.date })
      }
    } catch (err) {
      report.errors.push({ title: meeting.title, message: String(err?.message ?? err) })
    }
  }

  const reportPath = path.join(repoRoot, 'reports', `events-import-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: parsed ${report.parsed}, created ${report.created.length}, ` +
      `updated ${report.updated.length}, no date ${report.skippedNoDate.length}, ` +
      `errors ${report.errors.length}`,
  )
  console.log(`report → ${reportPath}`)
}

await run()
