/**
 * Import the curated member dataset into Payload.
 *
 * Run:  pnpm members:import                       (dry run, writes a report)
 *       MEMBERS_APPLY=1 pnpm members:import:apply
 *       pnpm members:import -- --data=data/other.json
 *
 * There used to be two of these. One went through the REST API and needed a
 * PAYLOAD_API_KEY that is not set; the other opened its own Postgres connection
 * and ran `INSERT INTO members`, which CLAUDE.md §3 forbids — content belongs to
 * Payload, and writing round it skips validation, hooks and access control. Half
 * of that script was code for translating documents into columns and back.
 *
 * Through the Local API neither is needed: no key, no SQL, and the matching and
 * payload-building rules stay where they were, in the tested lib module.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import {
  buildCreatePayload,
  buildIndexes,
  buildUpdatePayload,
  matchMember,
  validateDataset,
} from './lib/member-importer.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const apply = process.env.MEMBERS_APPLY === '1'

const dataArg = process.argv.find((arg) => arg.startsWith('--data='))
const dataPath = path.resolve(
  repoRoot,
  dataArg ? dataArg.slice('--data='.length) : 'data/mlkd-members-update.json',
)

async function run() {
  const payload = await getPayload({ config })
  const dataset = JSON.parse(await readFile(dataPath, 'utf8'))

  const invalidValues = validateDataset(dataset)

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    dataset: path.relative(repoRoot, dataPath),
    datasetMembers: dataset.members.length,
    existingMembers: 0,
    created: [],
    updated: [],
    unchanged: [],
    ambiguous: [],
    conflicts: [],
    invalidValues,
    identifiersSkipped: [],
    errors: [],
  }

  // A dataset that fails validation is not half-imported: nothing is written.
  if (invalidValues.length === 0) {
    const existing = (await payload.find({ collection: 'members', limit: 1000, depth: 0 })).docs
    report.existingMembers = existing.length

    const indexes = buildIndexes(existing)
    const now = new Date().toISOString()

    for (const member of dataset.members) {
      const idStatus = member.identifiers?.status
      if (idStatus === 'ambiguous' || idStatus === 'not_found') {
        report.identifiersSkipped.push({ name: member.name, status: idStatus })
      }

      const match = matchMember(member, indexes)
      if (match.status === 'ambiguous') {
        report.ambiguous.push({ name: member.name, reason: match.reason })
        continue
      }

      try {
        if (match.status === 'new') {
          const data = buildCreatePayload(member, now, dataset.rules.defaultBio)
          if (apply) {
            const created = await payload.create({ collection: 'members', data })
            report.created.push({ name: member.name, memberId: created.id })
          } else {
            report.created.push({ name: member.name })
          }
          continue
        }

        const { patch, fieldUpdates, conflicts } = buildUpdatePayload(match.doc, member, now)
        report.conflicts.push(...conflicts)
        if (fieldUpdates.length === 0) {
          report.unchanged.push(member.name)
          continue
        }
        // A conflict means the dataset and the record disagree about a field a
        // human may have edited; it is reported and left for a person to settle.
        if (apply && conflicts.length === 0) {
          await payload.update({ collection: 'members', id: match.doc.id, data: patch })
        }
        report.updated.push({
          name: member.name,
          memberId: match.doc.id,
          matchedBy: match.reason,
          fields: fieldUpdates,
        })
      } catch (err) {
        report.errors.push({ name: member.name, message: String(err?.message ?? err) })
      }
    }
  }

  const reportPath = path.join(repoRoot, 'reports', `members-import-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.datasetMembers} in dataset, ${report.existingMembers} on record — ` +
      `${report.created.length} created, ${report.updated.length} updated, ` +
      `${report.unchanged.length} unchanged, ${report.ambiguous.length} ambiguous, ` +
      `${report.conflicts.length} conflicts, ${report.errors.length} errors`,
  )
  console.log(`report → ${reportPath}`)

  // Loud failure: an invalid dataset or an unresolved conflict must not pass for
  // a successful run in a setup script.
  if (invalidValues.length > 0 || report.conflicts.length > 0 || report.errors.length > 0) {
    process.exitCode = 1
  }
}

await run()
