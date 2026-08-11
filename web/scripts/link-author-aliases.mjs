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
