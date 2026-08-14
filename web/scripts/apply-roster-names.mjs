/**
 * Restore full member names from the supervisor's rosters.
 *
 * Run:  pnpm members:names                     (dry run, writes a report)
 *       ROSTER_NAMES_APPLY=1 pnpm members:names:apply
 *
 * Eleven members were entered under a damaged name: ten shortened — "João Silva"
 * for "João Lourenço Silva", "Miguel Ferreira" for "Miguel Rasquinho Ferreira" —
 * and one stripped of its accent ("Helder Dias"). In a group with several João
 * Silvas a dropped surname is not a nickname, it is the wrong person: publication
 * attribution and the person page both key off the name a reader recognises.
 *
 * Matching is by LinkedIn URL or e-mail only — never by name similarity, which is
 * exactly what produced the short names. A roster entry whose identifier matches
 * nothing is reported, not guessed at.
 *
 * Names only. Roles, degrees and membership status are the supervisor's to set.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(dirname, '../data')

// The supervisor's own lists. The PhD one is grouped (active / "Suspensos" /
// "Terminados"); the MSc one is a flat alphabetical list of everyone who ever did
// an MSc with the group, so it says nothing about who is still here.
const ROSTERS = ['alunos-doutoramento.md', 'alunos-mestrado.md']

const apply = process.env.ROSTER_NAMES_APPLY === '1'

/** `[[Name]] <link or e-mail>`; section headers and "- desistiu" notes are ignored. */
function parseRoster(text) {
  const entries = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^\[\[(.+?)\]\]\s*(.*)$/.exec(line.trim())
    if (!match) continue
    const contact = match[2].trim().startsWith('-') ? '' : match[2].trim()
    entries.push({ name: match[1].trim(), contact })
  }
  return entries
}

/** Accent-blind, for comparing two spellings of one name — never for storing. */
const foldAccents = (value) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combining marks left behind by NFKD
    .toLowerCase()

const normalizeLinkedIn = (url) =>
  url
    .trim()
    .replace(/\/+$/, '')
    .replace(/^https?:\/\/[a-z]{2}\.linkedin\.com/i, 'https://www.linkedin.com')
    .toLowerCase()

async function run() {
  const payload = await getPayload({ config })

  const entries = []
  for (const file of ROSTERS) {
    entries.push(...parseRoster(await readFile(path.join(dataDir, file), 'utf8')))
  }

  const { docs: members } = await payload.find({ collection: 'members', limit: 1000, depth: 0 })

  const byLinkedIn = new Map()
  const byEmail = new Map()
  for (const member of members) {
    if (member.links?.linkedin) {
      const key = normalizeLinkedIn(member.links.linkedin)
      // An identifier shared by two members identifies neither.
      byLinkedIn.set(key, byLinkedIn.has(key) ? null : member)
    }
    if (member.email) {
      const key = member.email.trim().toLowerCase()
      byEmail.set(key, byEmail.has(key) ? null : member)
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    rosterEntries: entries.length,
    members: members.length,
    renamed: [],
    alreadyCorrect: 0,
    unmatched: [],
    ambiguous: [],
    skippedShorter: [],
  }

  const done = new Set()
  for (const entry of entries) {
    if (!entry.contact) continue

    const isEmail = entry.contact.includes('@') && !entry.contact.includes('://')
    const key = isEmail ? entry.contact.trim().toLowerCase() : normalizeLinkedIn(entry.contact)
    if (!isEmail && !key.includes('linkedin.com')) continue

    const index = isEmail ? byEmail : byLinkedIn
    if (!index.has(key)) {
      report.unmatched.push({ name: entry.name, contact: entry.contact })
      continue
    }
    const member = index.get(key)
    if (member === null) {
      report.ambiguous.push({ name: entry.name, contact: entry.contact })
      continue
    }
    if (member.name === entry.name) {
      report.alreadyCorrect += 1
      continue
    }
    // The rosters list the same person twice under two spellings; the first wins
    // rather than the two overwriting each other on successive passes.
    if (done.has(member.id)) continue
    done.add(member.id)

    // Only ever lengthen. The rosters list two people twice, once in full and
    // once shortened ("Miguel Amaral" and "Miguel Silva Amaral", one LinkedIn),
    // so without this the shorter entry undoes the longer one on the next run and
    // the name oscillates. Comparison is accent-blind in both directions, which is
    // what lets "Helder" -> "Hélder" through as a restoration rather than a rename.
    const current = member.name.split(/\s+/).map(foldAccents)
    const candidate = entry.name.split(/\s+/).map(foldAccents)
    const keepsEveryWord = current.every((word) => candidate.includes(word))
    if (candidate.length < current.length || !keepsEveryWord) {
      report.skippedShorter.push({ id: member.id, current: member.name, roster: entry.name })
      continue
    }

    if (apply) await payload.update({ collection: 'members', id: member.id, data: { name: entry.name } })
    report.renamed.push({ id: member.id, from: member.name, to: entry.name, slug: member.slug })
  }

  const reportPath = path.join(dirname, '..', 'reports', `roster-names-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.renamed.length} renamed, ${report.alreadyCorrect} already correct, ` +
      `${report.skippedShorter.length} shorter (skipped), ${report.unmatched.length} unmatched, ` +
      `${report.ambiguous.length} ambiguous`,
  )
  for (const row of report.renamed) console.log(`  #${row.id} ${row.from} -> ${row.to}`)
  console.log(`report → ${reportPath}`)
}

await run()
