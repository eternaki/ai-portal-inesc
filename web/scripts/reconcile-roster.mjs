/**
 * Compare our member records against the group's legacy team page.
 *
 * Run:  pnpm roster:reconcile
 *
 * READ-ONLY BY DESIGN. It writes a report and changes nothing. The roster import
 * that seeded this database marked 87 people as active MSc students; the group's
 * own site lists most of them as alumni. Which of those is right is a question for
 * the group, not for a script, so this produces the evidence and stops.
 *
 * Matching runs in three passes, weakest last, and every weak match is reported
 * separately so a human decides:
 *   1. exact normalised name
 *   2. the name recovered from the photo filename (the page abbreviates some)
 *   3. first + last name only  — reported as "needs review", never as certain
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import { parseLegacyTeamPage } from './lib/legacy-team-parser.mjs'
import { firstLastKey, normalizeName } from './lib/member-importer.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const TEAM_URL = 'https://mlkd.idss.inesc-id.pt/mlkd-team.html'

// Measured 2026-08-10. The parser reads generated markup, so its failure mode is
// silent under-matching; a count check turns a redesign into a loud error instead
// of a reconciliation that quietly compares against half the roster.
const EXPECTED_PEOPLE = 59

async function run() {
  const payload = await getPayload({ config })

  const res = await fetch(TEAM_URL, { headers: { 'user-agent': 'mlkd-portal-reconciler' } })
  if (!res.ok) throw new Error(`GET ${TEAM_URL} → ${res.status}`)
  const legacy = parseLegacyTeamPage(await res.text())

  if (legacy.length !== EXPECTED_PEOPLE) {
    throw new Error(
      `parsed ${legacy.length} people from the legacy team page, expected ${EXPECTED_PEOPLE}. ` +
        `The markup probably changed — fix the parser before trusting this report.`,
    )
  }

  const members = (await payload.find({ collection: 'members', limit: 1000, depth: 0 })).docs

  const byExact = new Map()
  const byFirstLast = new Map()
  const ambiguousFirstLast = new Set()
  for (const m of members) {
    byExact.set(normalizeName(m.name), m)
    const key = firstLastKey(m.name)
    if (!key) continue
    // A first+last key shared by two people is not usable as evidence.
    if (byFirstLast.has(key)) ambiguousFirstLast.add(key)
    byFirstLast.set(key, m)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: TEAM_URL,
    note: 'Read-only. No record was changed. Decisions belong to the group.',
    totals: { legacy: legacy.length, ours: members.length },
    statusMismatch: [],
    agrees: [],
    needsReview: [],
    onLegacySiteOnly: [],
    inOurDatabaseOnly: [],
    unmappedLegacyRole: [],
  }

  const matchedIds = new Set()

  for (const person of legacy) {
    if (!person.role) {
      report.unmappedLegacyRole.push({ name: person.name, title: person.title })
      continue
    }

    const candidates = [person.name, person.nameFromPhoto].filter(Boolean)
    let member = null
    let how = null

    for (const candidate of candidates) {
      const hit = byExact.get(normalizeName(candidate))
      if (hit) {
        member = hit
        how = candidate === person.name ? 'exact name' : 'photo filename'
        break
      }
    }

    if (!member) {
      for (const candidate of candidates) {
        const key = firstLastKey(candidate)
        if (!key || ambiguousFirstLast.has(key)) continue
        const hit = byFirstLast.get(key)
        if (hit) {
          member = hit
          how = 'first + last name only'
          break
        }
      }
    }

    if (!member) {
      report.onLegacySiteOnly.push({
        name: person.name,
        nameFromPhoto: person.nameFromPhoto,
        legacyRole: person.role,
        legacyStatus: person.membershipStatus,
      })
      continue
    }

    matchedIds.add(member.id)

    const entry = {
      legacyName: person.name,
      ourName: member.name,
      memberId: member.id,
      matchedBy: how,
      legacy: { role: person.role, membershipStatus: person.membershipStatus },
      ours: { role: member.role, membershipStatus: member.membershipStatus ?? 'active' },
    }

    const differs =
      entry.legacy.role !== entry.ours.role ||
      entry.legacy.membershipStatus !== entry.ours.membershipStatus

    if (how === 'first + last name only') report.needsReview.push({ ...entry, differs })
    else if (differs) report.statusMismatch.push(entry)
    else report.agrees.push(entry)
  }

  for (const member of members) {
    if (matchedIds.has(member.id)) continue
    report.inOurDatabaseOnly.push({
      memberId: member.id,
      name: member.name,
      role: member.role,
      membershipStatus: member.membershipStatus ?? 'active',
    })
  }

  const reportPath = path.join(repoRoot, 'reports', 'roster-reconciliation.json')
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `legacy ${report.totals.legacy} · ours ${report.totals.ours}\n` +
      `  agrees                 ${report.agrees.length}\n` +
      `  status mismatch        ${report.statusMismatch.length}\n` +
      `  needs review (fuzzy)   ${report.needsReview.length}\n` +
      `  on legacy site only    ${report.onLegacySiteOnly.length}\n` +
      `  in our database only   ${report.inOurDatabaseOnly.length}\n` +
      `  unmapped legacy role   ${report.unmappedLegacyRole.length}`,
  )
  console.log(`report → ${reportPath}`)
  console.log('Nothing was changed.')
}

await run()
