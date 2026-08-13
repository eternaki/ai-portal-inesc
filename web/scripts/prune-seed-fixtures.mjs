/**
 * Remove the development fixtures that ship inside the seed dump.
 *
 * Run:  pnpm seed:prune                    (dry run, writes a report)
 *       SEED_PRUNE_APPLY=1 pnpm seed:prune:apply
 *
 * `db/seed/mlkd-seed.sql.gz` carries a handful of invented records from early
 * development. Two of them are dissertations presented as open for application —
 * a student can apply to a topic that does not exist — so they go. They are not
 * deleted once and forgotten: the dump is committed, so every fresh setup
 * restores them, which is why this is a script and not a one-off delete.
 *
 * The seeded news item is deliberately kept: it is the only news on the site and
 * serves as a live example of how a post renders on the home page.
 *
 * Matching is by exact title, and the script refuses to delete when a title
 * matches more than one record — a fixture name colliding with real content is a
 * reason to stop, not to guess.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

// Every entry was confirmed present in db/seed/mlkd-seed.sql.gz and absent from
// the group's own site.
const FIXTURES = [
  { collection: 'dissertations', title: 'Deep learning for ECG-based diagnosis' },
  { collection: 'dissertations', title: 'Federated learning for medical records' },
]

const apply = process.env.SEED_PRUNE_APPLY === '1'

async function run() {
  const payload = await getPayload({ config })

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    deleted: [],
    alreadyGone: [],
    ambiguous: [],
    errors: [],
  }

  for (const fixture of FIXTURES) {
    const found = await payload.find({
      collection: fixture.collection,
      where: { title: { equals: fixture.title } },
      limit: 2,
      depth: 0,
    })

    if (found.docs.length === 0) {
      report.alreadyGone.push(fixture)
      continue
    }
    if (found.docs.length > 1) {
      report.ambiguous.push({ ...fixture, matched: found.docs.length })
      continue
    }

    const doc = found.docs[0]
    try {
      if (apply) await payload.delete({ collection: fixture.collection, id: doc.id })
      report.deleted.push({ ...fixture, id: doc.id })
    } catch (err) {
      report.errors.push({ ...fixture, message: String(err?.message ?? err) })
    }
  }

  const reportPath = path.join(repoRoot, 'reports', `seed-prune-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.deleted.length} ${apply ? 'deleted' : 'to delete'}, ` +
      `${report.alreadyGone.length} already gone, ${report.ambiguous.length} ambiguous, ` +
      `${report.errors.length} errors`,
  )
  for (const row of report.deleted) console.log(`  ${row.collection} #${row.id} ${row.title}`)
  for (const row of report.ambiguous) console.log(`  ! ${row.title}: ${row.matched} matches, left alone`)
  console.log(`report → ${reportPath}`)
}

await run()
