/**
 * Reconcile the supervisor's PhD roster with the member records.
 *
 * Run:  pnpm members:phd                     (dry run, writes a report)
 *       PHD_ROSTER_APPLY=1 pnpm members:phd:apply
 *
 * Two things, both from the "Terminados" section of alunos-doutoramento.md:
 *
 * 1. Twelve people carry `role: alumni`, which is the same mistake the status sync
 *    avoided — "alumni" is not a degree, and storing it in `role` throws away the
 *    fact that these twelve earned a PhD with the group. They become
 *    `role: phd` + `membershipStatus: completed`, which says the same thing without
 *    losing the degree, and leaves the `alumni` value unused.
 *
 * 2. Filipe Grácio finished his PhD here but has no member record at all — he is on
 *    neither the roster JSON nor the group's team page, so no earlier import saw
 *    him. He is created.
 *
 * The "Suspensos" are deliberately not created. They abandoned the doctorate and
 * the group took them off its own site; adding them back would be this script
 * inventing a membership nobody claims. They are reported instead.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import { normalizeName } from './lib/member-importer.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')
const ROSTER = path.join(repoRoot, 'data', 'alunos-doutoramento.md')

const apply = process.env.PHD_ROSTER_APPLY === '1'

/** `[[Name]] <link>` under an `active` / `suspended` / `finished` heading. */
function parseRoster(text) {
  const rows = []
  let section = 'active'
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const lower = trimmed.toLowerCase()
    if (lower.startsWith('suspenso')) { section = 'suspended'; continue }
    if (lower.startsWith('terminado')) { section = 'finished'; continue }
    const match = /^\[\[(.+?)\]\]\s*(.*)$/.exec(trimmed)
    if (!match) continue
    const rest = match[2].trim()
    rows.push({ name: match[1].trim(), link: rest.startsWith('-') ? '' : rest, section })
  }
  return rows
}

async function run() {
  const payload = await getPayload({ config })
  const roster = parseRoster(await readFile(ROSTER, 'utf8'))

  const members = (await payload.find({ collection: 'members', limit: 1000, depth: 0 })).docs
  const byName = new Map(members.map((m) => [normalizeName(m.name), m]))

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    roster: ROSTER,
    rosterEntries: roster.length,
    degreeRestored: [],
    created: [],
    alreadyCorrect: [],
    suspendedNotCreated: [],
    unexpected: [],
    errors: [],
  }

  for (const entry of roster) {
    const member = byName.get(normalizeName(entry.name))

    if (entry.section === 'suspended') {
      if (!member) report.suspendedNotCreated.push({ name: entry.name })
      else report.unexpected.push({ id: member.id, name: member.name, role: member.role,
        note: 'listed under Suspensos but present as a member — the supervisor should decide' })
      continue
    }
    if (entry.section !== 'finished') continue

    if (!member) {
      const data = {
        name: entry.name,
        role: 'phd',
        membershipStatus: 'completed',
        ...(entry.link.includes('linkedin.com') ? { links: { linkedin: entry.link } } : {}),
      }
      try {
        if (apply) await payload.create({ collection: 'members', data })
        report.created.push({ name: entry.name, ...data })
      } catch (err) {
        report.errors.push({ name: entry.name, message: String(err?.message ?? err) })
      }
      continue
    }

    if (member.role === 'phd' && member.membershipStatus === 'completed') {
      report.alreadyCorrect.push({ id: member.id, name: member.name })
      continue
    }
    // Only the alumni-for-a-degree case is rewritten. Anything else is somebody's
    // deliberate edit, and this script has no business overruling it.
    if (member.role !== 'alumni') {
      report.unexpected.push({ id: member.id, name: member.name, role: member.role,
        membershipStatus: member.membershipStatus, note: 'finished PhD but role is not alumni' })
      continue
    }

    try {
      if (apply) {
        await payload.update({
          collection: 'members',
          id: member.id,
          data: { role: 'phd', membershipStatus: 'completed' },
        })
      }
      report.degreeRestored.push({ id: member.id, name: member.name, from: 'alumni', to: 'phd' })
    } catch (err) {
      report.errors.push({ id: member.id, name: member.name, message: String(err?.message ?? err) })
    }
  }

  const reportPath = path.join(repoRoot, 'reports', `phd-roster-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.degreeRestored.length} degree restored, ${report.created.length} created, ` +
      `${report.alreadyCorrect.length} already correct, ${report.suspendedNotCreated.length} suspended (left out), ` +
      `${report.unexpected.length} unexpected, ${report.errors.length} errors`,
  )
  for (const row of report.degreeRestored) console.log(`  #${row.id} ${row.name}: alumni -> phd`)
  for (const row of report.created) console.log(`  + created ${row.name} (phd, completed)`)
  for (const row of report.unexpected) console.log(`  ? ${row.name}: ${row.note}`)
  console.log(`report → ${reportPath}`)
}

await run()
