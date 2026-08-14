/**
 * Mark as completed the members the group's own team page lists as alumni.
 *
 * Run:  pnpm members:status                      (dry run, writes a report)
 *       LEGACY_STATUS_APPLY=1 pnpm members:status:apply
 *
 * 44 people are stored here as active MSc students while the group's site has long
 * shown them as alumni — which is why our "MSc students" count reads 89. The
 * supervisor's MSc roster cannot settle it: that list is everyone who ever did an
 * MSc with the group, current and long-graduated in one alphabetical run. His team
 * page is the only source that distinguishes them.
 *
 * Only `membershipStatus` is written. `role` is deliberately left alone: it holds
 * the degree ("MSc student"), and the collection has a separate field for whether
 * the person is still here. Overwriting the degree with "Alumni" — as this script
 * first intended — would throw away which degree they did, and the site already
 * groups people by membershipStatus, so it would gain nothing either.
 *
 * One-directional: active -> completed only. Reviving somebody the group retired
 * is not a call this script gets to make, so the reverse is reported, not applied.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import { parseLegacyTeamPage } from './lib/legacy-team-parser.mjs'
import { aliasedMemberName } from './lib/legacy-photo-aliases.mjs'
import { buildMemberIndex, matchMember } from './lib/member-matcher.mjs'
import { normalizeName } from './lib/member-importer.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const TEAM_URL = 'https://mlkd.idss.inesc-id.pt/mlkd-team.html'
const EXPECTED_PEOPLE = 59

const apply = process.env.LEGACY_STATUS_APPLY === '1'

async function run() {
  const payload = await getPayload({ config })

  const res = await fetch(TEAM_URL, { headers: { 'user-agent': 'mlkd-portal-status-sync' } })
  if (!res.ok) throw new Error(`GET ${TEAM_URL} → ${res.status}`)
  const legacy = parseLegacyTeamPage(await res.text())

  if (legacy.length !== EXPECTED_PEOPLE) {
    throw new Error(
      `parsed ${legacy.length} people from the team page, expected ${EXPECTED_PEOPLE}. ` +
        `The markup probably changed — check the parser before touching anybody's standing.`,
    )
  }

  const members = (await payload.find({ collection: 'members', limit: 1000, depth: 0 })).docs
  const index = buildMemberIndex(members)

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    source: TEAM_URL,
    legacyPeople: legacy.length,
    completed: [],
    alreadyCompleted: [],
    stillActiveThere: [],
    wouldRevive: [],
    unknownLabel: [],
    unmatched: [],
    errors: [],
  }

  const seen = new Set()

  for (const person of legacy) {
    if (!person.membershipStatus) {
      report.unknownLabel.push({ name: person.name, title: person.title })
      continue
    }

    // Same pins as the photo importer: their page abbreviates and misspells a few
    // names, and two different people share one display name.
    const pinned = aliasedMemberName(person.photoPath)
    const member = pinned
      ? (index.byExact.get(normalizeName(pinned)) ?? null)
      : matchMember(person, index).member

    if (!member) {
      report.unmatched.push({ name: person.name, title: person.title })
      continue
    }
    if (seen.has(member.id)) continue
    seen.add(member.id)

    const row = { id: member.id, name: member.name, role: member.role, theirLabel: person.title }

    if (person.membershipStatus !== 'completed') {
      if (member.membershipStatus === 'completed') report.wouldRevive.push(row)
      else report.stillActiveThere.push(row)
      continue
    }
    if (member.membershipStatus === 'completed') {
      report.alreadyCompleted.push(row)
      continue
    }

    try {
      // membershipStatus only — role stays whatever degree the person holds.
      if (apply) {
        await payload.update({
          collection: 'members',
          id: member.id,
          data: { membershipStatus: 'completed' },
        })
      }
      report.completed.push(row)
    } catch (err) {
      report.errors.push({ id: member.id, name: member.name, message: String(err?.message ?? err) })
    }
  }

  const reportPath = path.join(repoRoot, 'reports', `legacy-status-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.completed.length} marked completed, ` +
      `${report.alreadyCompleted.length} already were, ${report.stillActiveThere.length} active on both, ` +
      `${report.wouldRevive.length} would revive (skipped), ${report.unmatched.length} unmatched, ` +
      `${report.errors.length} errors`,
  )
  for (const row of report.completed) console.log(`  #${row.id} ${row.name} (${row.role})`)
  console.log(`report → ${reportPath}`)
}

await run()
