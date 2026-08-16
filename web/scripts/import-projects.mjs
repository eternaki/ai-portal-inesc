/**
 * Import the group's funded projects from its legacy projects page.
 *
 * Run:  pnpm projects:import                       (dry run, writes a report)
 *       PROJECTS_APPLY=1 pnpm projects:import:apply
 *
 * The portal shipped with an empty `projects` collection while the group's own
 * site has listed nine funded projects for years — so the section existed but had
 * nothing to show. This carries them over: acronym, principal investigator, the
 * years and the funding body, and a link to the project's own page.
 *
 * Writes through Payload's Local API under `payload run`, so no API key is needed.
 *
 * Idempotent: a project is matched on title. Re-running updates the funding and
 * year fields (the legacy page is the source of truth for those) but never
 * overwrites a description or member/theme links an editor added here.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import { parseLegacyProjectsPage } from './lib/legacy-projects-parser.mjs'
import { buildMemberAliasIndex, matchAuthorToMember } from './lib/publication-member-linker.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const SOURCE = 'https://mlkd.idss.inesc-id.pt/mlkd-projects.html'

// Measured 2026-08-16. The parser reads generated markup whose whitespace varies
// between entries, so its failure mode is silent under-matching — one project was
// already lost that way once. Refuse to import a short read rather than quietly
// publish an incomplete list.
const EXPECTED_PROJECTS = 9

const apply = process.env.PROJECTS_APPLY === '1'

/**
 * The curated member dataset, which carries each person's full name and known
 * aliases. The alias index is far better at matching a legacy page's formal
 * "First Middle Middle Last" against a short profile name when it has these.
 * Missing file is not fatal — matching just gets stricter.
 */
async function loadMemberDataset() {
  try {
    const raw = await readFile(path.join(repoRoot, 'data', 'mlkd-members-update.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : (parsed.members ?? [])
  } catch {
    return []
  }
}

/**
 * "Arlindo Manuel Limede de Oliveira" → "Arlindo Oliveira".
 *
 * The legacy page writes principal investigators in full civil-registry form,
 * while profiles here are short ("Arlindo L. Oliveira"). The alias index already
 * generates a "first last" variant per member, so reducing the formal name to its
 * first and last token is enough to meet it — and it stays safe, because a
 * different first name (João vs Mário Silva) still misses and ambiguity is still
 * refused by the index rather than guessed here.
 */
function firstLast(value) {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] ?? ''
}

/** Try the name as written, then its first+last reduction. */
function matchInvestigator(name, aliasIndex) {
  const direct = matchAuthorToMember(name, aliasIndex)
  if (direct.status === 'matched') return direct
  const short = firstLast(name)
  return short && short !== name ? matchAuthorToMember(short, aliasIndex) : direct
}

async function run() {
  const payload = await getPayload({ config })

  const res = await fetch(SOURCE, { headers: { 'user-agent': 'mlkd-portal-importer' } })
  if (!res.ok) throw new Error(`GET ${SOURCE} → ${res.status}`)
  const projects = parseLegacyProjectsPage(await res.text())

  if (projects.length !== EXPECTED_PROJECTS) {
    throw new Error(
      `parsed ${projects.length} projects, expected ${EXPECTED_PROJECTS}. ` +
        `The legacy markup probably changed — fix the parser before importing.`,
    )
  }

  // Principal investigators are named in full on the legacy page ("Arlindo Manuel
  // Limede de Oliveira") while members are stored short ("Arlindo L. Oliveira").
  // Reuse the publication linker's alias index rather than matching on surname:
  // a naive surname match linked EXCELERATE's PI ("Mário ... da Silva") to a
  // different member named Silva. That index generates initial/middle-name
  // variants and refuses ambiguous names outright.
  const members = (await payload.find({ collection: 'members', limit: 500, depth: 0 })).docs
  const datasetMembers = await loadMemberDataset()
  const aliasIndex = buildMemberAliasIndex(members, datasetMembers)

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    source: SOURCE,
    parsed: projects.length,
    created: [],
    updated: [],
    unlinkedInvestigators: [],
    unknownKind: [],
  }

  for (const project of projects) {
    const existing = (
      await payload.find({
        collection: 'projects',
        where: { title: { equals: project.title } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]

    let pi
    if (project.principalInvestigator) {
      const match = matchInvestigator(project.principalInvestigator, aliasIndex)
      if (match.status === 'matched') {
        pi = match.member
      } else {
        report.unlinkedInvestigators.push({
          project: project.title,
          investigator: project.principalInvestigator,
          reason: match.reason,
        })
      }
    }
    if (!project.kind) report.unknownKind.push({ project: project.title, funding: project.funding })

    // Only the fields the legacy page owns. Description, themes and any extra
    // members stay whatever an editor set here.
    const data = {
      title: project.title,
      yearStart: project.yearStart ?? undefined,
      yearEnd: project.yearEnd ?? undefined,
      funding: project.funding ?? undefined,
      url: project.url,
      ...(project.kind ? { kind: project.kind } : {}),
    }

    if (existing) {
      report.updated.push({ id: existing.id, title: project.title })
      if (apply) {
        await payload.update({ collection: 'projects', id: existing.id, data, overrideAccess: true })
      }
    } else {
      report.created.push({ title: project.title, funding: project.funding, pi: pi?.name ?? null })
      if (apply) {
        await payload.create({
          collection: 'projects',
          data: { ...data, ...(pi ? { members: [pi.id] } : {}) },
          overrideAccess: true,
        })
      }
    }
  }

  const outDir = path.join(repoRoot, 'reports')
  await mkdir(outDir, { recursive: true })
  const outFile = path.join(outDir, apply ? 'projects-apply.json' : 'projects-dry-run.json')
  await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.created.length} to create, ${report.updated.length} to update, ` +
      `${report.unlinkedInvestigators.length} PI(s) unlinked → ${path.relative(repoRoot, outFile)}`,
  )
  process.exit(0)
}

await run()
