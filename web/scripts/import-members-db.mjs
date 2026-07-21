import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

import {
  buildCreatePayload,
  buildIndexes,
  buildUpdatePayload,
  normalizeName,
  validateDataset,
} from './lib/member-importer.mjs'

const require = createRequire(import.meta.url)
const pgPath = require.resolve('pg', { paths: [require.resolve('@payloadcms/db-postgres')] })
const { Client } = require(pgPath)

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const dataArg = process.argv.find((arg) => arg.startsWith('--data='))
const reportArg = process.argv.find((arg) => arg.startsWith('--report='))

const repoRoot = path.resolve(import.meta.dirname, '..')
const dataPath = dataArg ? dataArg.slice('--data='.length) : path.join(repoRoot, 'data', 'mlkd-members-update.json')
const reportPath = reportArg
  ? reportArg.slice('--report='.length)
  : path.join(repoRoot, 'reports', `members-import-db-${apply ? 'apply' : 'dry-run'}.json`)

const COLUMN_BY_FIELD = {
  name: 'name',
  role: 'role',
  bioAiDraft: 'bio_ai_draft',
  orcid: 'orcid',
  cienciaId: 'ciencia_id',
  openalexId: 'openalex_id',
  dblpKey: 'dblp_key',
  tecnicoId: 'tecnico_id',
  'links.linkedin': 'links_linkedin',
  'links.tecnicoPage': 'links_tecnico_page',
  'links.personalPage': 'links_personal_page',
  'links.googleScholar': 'links_google_scholar',
  'links.github': 'links_github',
  email: 'email',
  showEmail: 'show_email',
  showLinkedIn: 'show_linked_in',
  showGitHub: 'show_git_hub',
  showORCID: 'show_o_r_c_i_d',
  showCienciaId: 'show_ciencia_id',
  showDBLP: 'show_d_b_l_p',
  showTecnicoPage: 'show_tecnico_page',
  showPersonalPage: 'show_personal_page',
  showGoogleScholar: 'show_google_scholar',
  contactsSource: 'contacts_source',
  contactsVerifiedAt: 'contacts_verified_at',
  identifiersVerified: 'identifiers_verified',
  identifiersConfidence: 'identifiers_confidence',
  identifiersSource: 'identifiers_source',
  identifiersVerifiedAt: 'identifiers_verified_at',
}

function slugify(value) {
  return normalizeName(value).replace(/\s+/g, '-')
}

function rowToDoc(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    bioAiDraft: row.bio_ai_draft,
    orcid: row.orcid,
    cienciaId: row.ciencia_id,
    openalexId: row.openalex_id,
    dblpKey: row.dblp_key,
    tecnicoId: row.tecnico_id,
    links: {
      linkedin: row.links_linkedin,
      tecnicoPage: row.links_tecnico_page,
      personalPage: row.links_personal_page,
      googleScholar: row.links_google_scholar,
      github: row.links_github,
    },
    email: row.email,
    showEmail: row.show_email,
    showLinkedIn: row.show_linked_in,
    showGitHub: row.show_git_hub,
    showORCID: row.show_o_r_c_i_d,
    showCienciaId: row.show_ciencia_id,
    showDBLP: row.show_d_b_l_p,
    showTecnicoPage: row.show_tecnico_page,
    showPersonalPage: row.show_personal_page,
    showGoogleScholar: row.show_google_scholar,
    contactsSource: row.contacts_source,
    contactsVerifiedAt: row.contacts_verified_at,
    identifiersVerified: row.identifiers_verified,
    identifiersConfidence: row.identifiers_confidence,
    identifiersSource: row.identifiers_source,
    identifiersVerifiedAt: row.identifiers_verified_at,
  }
}

function flatten(obj, prefix = '') {
  const out = {}
  for (const [key, value] of Object.entries(obj ?? {})) {
    const field = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(out, flatten(value, field))
    else out[field] = value
  }
  return out
}

async function insertMember(client, data) {
  const flat = flatten(data)
  flat.slug = slugify(data.name)
  flat.updatedAt = new Date().toISOString()
  flat.createdAt = new Date().toISOString()

  const entries = Object.entries(flat)
    .map(([field, value]) => [COLUMN_BY_FIELD[field] ?? (field === 'slug' ? 'slug' : field), value])
    .filter(([column]) => column in reverseColumns())

  const columns = entries.map(([column]) => column)
  const values = entries.map(([, value]) => value)
  const placeholders = values.map((_, index) => `$${index + 1}`)
  const query = `
    INSERT INTO members (${columns.map((column) => `"${column}"`).join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING id
  `
  const result = await client.query(query, values)
  return result.rows[0].id
}

async function updateMember(client, id, patch) {
  const flat = flatten(patch)
  const entries = Object.entries(flat)
    .map(([field, value]) => [COLUMN_BY_FIELD[field], value])
    .filter(([column]) => Boolean(column))
  if (!entries.length) return
  entries.push(['updated_at', new Date().toISOString()])
  const assignments = entries.map(([column], index) => `"${column}"=$${index + 1}`)
  const values = entries.map(([, value]) => value)
  values.push(id)
  await client.query(`UPDATE members SET ${assignments.join(', ')} WHERE id=$${values.length}`, values)
}

function reverseColumns() {
  return {
    name: true,
    slug: true,
    role: true,
    bio_ai_draft: true,
    orcid: true,
    ciencia_id: true,
    openalex_id: true,
    dblp_key: true,
    tecnico_id: true,
    links_linkedin: true,
    links_tecnico_page: true,
    links_personal_page: true,
    links_google_scholar: true,
    links_github: true,
    email: true,
    show_email: true,
    show_linked_in: true,
    show_git_hub: true,
    show_o_r_c_i_d: true,
    show_ciencia_id: true,
    show_d_b_l_p: true,
    show_tecnico_page: true,
    show_personal_page: true,
    show_google_scholar: true,
    contacts_source: true,
    contacts_verified_at: true,
    identifiers_verified: true,
    identifiers_confidence: true,
    identifiers_source: true,
    identifiers_verified_at: true,
    updated_at: true,
    created_at: true,
  }
}

const dataset = JSON.parse(await readFile(dataPath, 'utf8'))
const invalidValues = validateDataset(dataset)
const report = {
  mode: apply ? 'direct-db-apply' : 'direct-db-dry-run',
  totalInputMembers: dataset.members.length,
  existingMembers: 0,
  created: [],
  updated: [],
  unchanged: [],
  ambiguous: [],
  conflicts: [],
  invalidValues,
  identifiersSkipped: [],
}

if (!invalidValues.length) {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  const now = new Date().toISOString()
  const rows = (await client.query('SELECT * FROM members ORDER BY id')).rows
  const existingMembers = rows.map(rowToDoc)
  report.existingMembers = existingMembers.length
  const indexes = buildIndexes(existingMembers)

  for (const member of dataset.members) {
    const idStatus = member.identifiers?.status
    if (idStatus === 'ambiguous' || idStatus === 'not_found') {
      report.identifiersSkipped.push({ name: member.name, status: idStatus })
    }

    const match = await import('./lib/member-importer.mjs').then((mod) => mod.matchMember(member, indexes))
    if (match.status === 'ambiguous') {
      report.ambiguous.push({ name: member.name, reason: match.reason })
      continue
    }

    if (match.status === 'new') {
      const data = buildCreatePayload(member, now, dataset.rules.defaultBio)
      if (apply) {
        const id = await insertMember(client, data)
        report.created.push({ name: member.name, memberId: id })
      } else {
        report.created.push({ name: member.name })
      }
      continue
    }

    const { patch, fieldUpdates, conflicts } = buildUpdatePayload(match.doc, member, now)
    report.conflicts.push(...conflicts)
    if (!fieldUpdates.length) {
      report.unchanged.push(member.name)
      continue
    }
    if (apply && !conflicts.length) await updateMember(client, match.doc.id, patch)
    report.updated.push({ name: member.name, memberId: match.doc.id, matchedBy: match.reason, fields: fieldUpdates })
  }
  await client.end()
}

await mkdir(path.dirname(reportPath), { recursive: true })
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

if (invalidValues.length || report.conflicts.length) process.exitCode = 1
console.log(`Members DB import report written to ${reportPath}`)
