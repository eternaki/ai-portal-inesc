/**
 * Merge publications that OpenAlex indexed more than once.
 *
 * Run:  pnpm publications:dedupe                    (dry run, writes a report)
 *       PUBLICATIONS_DEDUPE_APPLY=1 pnpm publications:dedupe:apply
 *
 * Twenty-three papers appear twice on the site — the IEEE record and the ACM
 * record of one conference paper, an arXiv preprint beside its proceedings
 * version, a repository copy with no abstract. On a group's publication list
 * those are one entry.
 *
 * The rules live in lib/publication-dedupe.mjs and are unit-tested, because this
 * script rewrites rows. Nothing is merged unless the two records share a title
 * *and* an author team (compared by surname, order-insensitive — the indexers
 * disagree on everything else) and sit within a few years of each other. A pair
 * that fails any check is reported and left alone.
 *
 * The loser is **parked, not deleted** — status `rejected`, which hides it from
 * every public page but keeps the row. This matters more than it looks: ingest
 * finds existing publications by openalexId among the rows that exist, so a
 * deleted duplicate is simply re-created on the next run. That is what happened
 * to the twenty-six merged in August; they were back before the month was out.
 *
 * Before parking it, the loser's abstract, venue, links, citation count and any
 * AI summary are copied onto the keeper where it has none, and its author rows
 * donate member links the keeper is missing — otherwise a person can lose a
 * publication from their profile page. Its DOI stays with it: the field is
 * unique, and the loser now keeps its row.
 *
 * Depends on PAYLOAD_API_KEY being set for the AI service. Without it the ingest
 * queries Payload anonymously, sees only published rows, cannot see the parked
 * duplicate, and re-creates it — the exact failure this change exists to stop.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import {
  isDedupeCandidate,
  MERGED_AWAY_STATUS,
  isSameWork,
  mergeAuthorLinks,
  mergeFields,
  pickWinner,
} from './lib/publication-dedupe.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const apply = process.env.PUBLICATIONS_DEDUPE_APPLY === '1'

const normalizeTitle = (title) =>
  (title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

async function run() {
  const payload = await getPayload({ config })

  // Parked duplicates are excluded, or a second run re-examines every pair it
  // already settled and pickWinner can reverse itself on the tie-break.
  const all = (await payload.find({ collection: 'publications', limit: 2000, depth: 0 })).docs.filter(
    isDedupeCandidate,
  )

  const groups = new Map()
  for (const pub of all) {
    const key = normalizeTitle(pub.title)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(pub)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    publications: all.length,
    duplicateGroups: 0,
    merged: [],
    refused: [],
    errors: [],
  }

  for (const [, records] of groups) {
    if (records.length < 2) continue
    report.duplicateGroups += 1

    // More than two would need a decision about order; report instead of guessing.
    if (records.length > 2) {
      report.refused.push({
        title: records[0].title,
        ids: records.map((r) => r.id),
        reason: `${records.length} records share this title — merge by hand`,
      })
      continue
    }

    const [a, b] = records
    const verdict = isSameWork(a, b)
    if (!verdict.same) {
      report.refused.push({ title: a.title, ids: [a.id, b.id], reason: verdict.reason })
      continue
    }

    const { winner, loser } = pickWinner(a, b)
    const patch = mergeFields(winner, loser)
    const { authors, changed } = mergeAuthorLinks(winner.authors, loser.authors)
    if (changed > 0) patch.authors = authors

    const entry = {
      title: winner.title,
      kept: { id: winner.id, type: winner.type, year: winner.year, citations: winner.citationCount ?? 0 },
      parked: { id: loser.id, type: loser.type, year: loser.year, citations: loser.citationCount ?? 0 },
      carriedOver: Object.keys(patch),
      memberLinksRescued: changed,
      // Recorded rather than resolved: when both records carry a real abstract
      // one of them is about to leave the site, and that is worth being able to
      // look up afterwards instead of discovering it from a reader.
      ...(winner.abstract && loser.abstract && winner.abstract !== loser.abstract && !patch.abstract
        ? { abstractDiffered: { kept: winner.abstract.length, dropped: loser.abstract.length } }
        : {}),
    }

    try {
      if (apply) {
        if (Object.keys(patch).length > 0) {
          await payload.update({ collection: 'publications', id: winner.id, data: patch })
        }
        await payload.update({
          collection: 'publications',
          id: loser.id,
          // recordEditorialDecision picks this up and appends to reviewHistory,
          // so why the record left the site is answerable a year from now.
          data: { status: MERGED_AWAY_STATUS, reviewNote: `Merged into #${winner.id}` },
        })
      }
      report.merged.push(entry)
    } catch (err) {
      report.errors.push({ title: winner.title, message: String(err?.message ?? err) })
    }
  }

  const reportPath = path.join(repoRoot, 'reports', `publications-dedupe-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.duplicateGroups} duplicate group(s), ${report.merged.length} merged, ` +
      `${report.refused.length} refused, ${report.errors.length} errors`,
  )
  for (const row of report.merged) {
    console.log(
      `  keep #${row.kept.id} (${row.kept.type}, ${row.kept.year}, ${row.kept.citations} cites) ` +
        `— park #${row.parked.id} (${row.parked.type}, ${row.parked.year})` +
        (row.carriedOver.length ? `  [+${row.carriedOver.join(', ')}]` : '') +
        (row.memberLinksRescued ? `  [${row.memberLinksRescued} member link(s)]` : ''),
    )
  }
  for (const row of report.refused) console.log(`  ! ${row.title.slice(0, 60)}: ${row.reason}`)
  console.log(`report → ${reportPath}`)
}

await run()
