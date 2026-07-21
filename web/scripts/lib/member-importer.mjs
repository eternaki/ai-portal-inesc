import assert from 'node:assert/strict'

export const IDENTIFIER_STATUSES = new Set(['verified', 'partial'])

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-[\dX]{4}$/
const CIENCIA_RE = /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/
const OPENALEX_RE = /^A\d+$/
const TECNICO_RE = /^ist\d+$/

export function normalizeName(value = '') {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function firstLastKey(value = '') {
  const parts = normalizeName(value).split(' ').filter(Boolean)
  if (parts.length < 2) return normalizeName(value)
  return `${parts[0]} ${parts[parts.length - 1]}`
}

export function normalizeEmail(value = '') {
  return value.trim().toLowerCase()
}

export function normalizeUrl(value = '') {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const url = new URL(trimmed)
  url.hash = ''
  url.search = ''
  if (['pt.linkedin.com', 'es.linkedin.com', 'nl.linkedin.com', 'linkedin.com'].includes(url.hostname)) {
    url.hostname = 'www.linkedin.com'
  }
  if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
    url.hostname = 'github.com'
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

export function normalizeIdentifier(field, value) {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (field === 'cienciaId') return trimmed.toUpperCase()
  if (field === 'tecnicoId') return trimmed.toLowerCase()
  if (field === 'openalexId') return trimmed.replace(/^https:\/\/openalex.org\//, '')
  return trimmed
}

export function validateIdentifier(field, value) {
  if (!value) return true
  const normalized = normalizeIdentifier(field, value)
  if (field === 'orcid') return ORCID_RE.test(normalized)
  if (field === 'cienciaId') return CIENCIA_RE.test(normalized)
  if (field === 'openalexId') return OPENALEX_RE.test(normalized)
  if (field === 'tecnicoId') return TECNICO_RE.test(normalized)
  return true
}

function getField(doc, path) {
  return path.split('.').reduce((obj, key) => obj?.[key], doc)
}

function setField(doc, path, value) {
  const parts = path.split('.')
  const last = parts.pop()
  let cursor = doc
  for (const part of parts) {
    cursor[part] ??= {}
    cursor = cursor[part]
  }
  cursor[last] = value
}

function equalValue(path, existing, incoming) {
  if (existing == null || existing === '') return false
  if (path.startsWith('links.')) return normalizeUrl(existing) === normalizeUrl(incoming)
  if (path === 'email') return normalizeEmail(existing) === normalizeEmail(incoming)
  if (['orcid', 'cienciaId', 'openalexId', 'dblpKey', 'tecnicoId'].includes(path)) {
    return normalizeIdentifier(path, existing) === normalizeIdentifier(path, incoming)
  }
  return existing === incoming
}

function addFieldChange({ existing, patch, report, member, path, value }) {
  if (value == null || value === '') return
  const current = getField(existing, path)
  if (current == null || current === '') {
    setField(patch, path, value)
    report.fieldUpdates.push(path)
    return
  }
  if (equalValue(path, current, value)) return
  report.conflicts.push({ name: member.name, field: path, existing: current, incoming: value })
}

export function buildIndexes(existingDocs) {
  const byIdentifier = new Map()
  const byName = new Map()
  const byFirstLast = new Map()
  const byEmail = new Map()

  for (const doc of existingDocs) {
    for (const key of ['orcid', 'cienciaId', 'openalexId', 'dblpKey', 'tecnicoId']) {
      if (doc[key]) byIdentifier.set(`${key}:${normalizeIdentifier(key, doc[key])}`, doc)
    }
    if (doc.email) byEmail.set(normalizeEmail(doc.email), doc)

    const normalized = normalizeName(doc.name)
    if (!byName.has(normalized)) byName.set(normalized, [])
    byName.get(normalized).push(doc)

    const short = firstLastKey(doc.name)
    if (!byFirstLast.has(short)) byFirstLast.set(short, [])
    byFirstLast.get(short).push(doc)
  }

  return { byIdentifier, byName, byFirstLast, byEmail }
}

export function matchMember(input, indexes) {
  const ids = input.identifiers ?? {}
  for (const key of ['orcid', 'cienciaId', 'openalexId', 'dblpKey', 'tecnicoId']) {
    const value = ids[key]
    const match = value && indexes.byIdentifier.get(`${key}:${normalizeIdentifier(key, value)}`)
    if (match) return { status: 'matched', doc: match, reason: key }
  }

  if (input.contact?.type === 'email') {
    const match = indexes.byEmail.get(normalizeEmail(input.contact.value))
    if (match) return { status: 'matched', doc: match, reason: 'email' }
  }

  const names = [input.name, input.fullName, ...(input.aliases ?? [])]
  for (const name of names) {
    const candidates = indexes.byName.get(normalizeName(name)) ?? []
    if (candidates.length === 1) return { status: 'matched', doc: candidates[0], reason: 'name' }
    if (candidates.length > 1) return { status: 'ambiguous', reason: 'multiple exact name matches' }
  }

  for (const name of names) {
    const candidates = indexes.byFirstLast.get(firstLastKey(name)) ?? []
    if (candidates.length === 1) return { status: 'matched', doc: candidates[0], reason: 'first-last name' }
    if (candidates.length > 1) return { status: 'ambiguous', reason: 'multiple first-last matches' }
  }

  return { status: 'new', reason: 'no existing match' }
}

function contactPatch(member) {
  if (!member.contact?.value) return {}
  const value = member.contact.type === 'email' ? normalizeEmail(member.contact.value) : normalizeUrl(member.contact.value)
  if (member.contact.type === 'email') {
    return {
      email: value,
      showEmail: value.endsWith('@tecnico.ulisboa.pt'),
    }
  }
  if (member.contact.type === 'linkedin') return { links: { linkedin: value }, showLinkedIn: true }
  if (member.contact.type === 'github') return { links: { github: value }, showGitHub: true }
  return {}
}

function identifierPatch(member, now) {
  const ids = member.identifiers ?? {}
  if (!IDENTIFIER_STATUSES.has(ids.status)) return {}

  const patch = {
    identifiersVerified: ids.status === 'verified',
    identifiersConfidence: ids.confidence,
    identifiersSource: ids.sourceUrl,
    identifiersVerifiedAt: now,
  }

  for (const key of ['orcid', 'cienciaId', 'openalexId', 'dblpKey', 'tecnicoId']) {
    if (ids[key]) patch[key] = normalizeIdentifier(key, ids[key])
  }
  return patch
}

export function buildCreatePayload(member, now, defaultBio) {
  return {
    name: member.name,
    role: member.name === 'Arlindo Oliveira' ? 'faculty' : 'msc',
    bioAiDraft: defaultBio,
    contactsSource: 'mlkd_members_contacts consolidated review',
    contactsVerifiedAt: now,
    showEmail: false,
    showLinkedIn: true,
    showGitHub: true,
    showORCID: true,
    showCienciaId: true,
    showDBLP: true,
    showTecnicoPage: true,
    showPersonalPage: true,
    showGoogleScholar: true,
    ...contactPatch(member),
    ...identifierPatch(member, now),
  }
}

export function buildUpdatePayload(existing, member, now) {
  const patch = { contactsVerifiedAt: now }
  const report = { fieldUpdates: [], conflicts: [] }

  for (const [path, value] of Object.entries(flatten(contactPatch(member)))) {
    addFieldChange({ existing, patch, report, member, path, value })
  }
  for (const [path, value] of Object.entries(flatten(identifierPatch(member, now)))) {
    addFieldChange({ existing, patch, report, member, path, value })
  }
  addFieldChange({
    existing,
    patch,
    report,
    member,
    path: 'contactsSource',
    value: 'mlkd_members_contacts consolidated review',
  })

  return { patch, fieldUpdates: report.fieldUpdates, conflicts: report.conflicts }
}

export function flatten(obj, prefix = '') {
  const out = {}
  for (const [key, value] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path))
    } else {
      out[path] = value
    }
  }
  return out
}

export function validateDataset(dataset) {
  assert.equal(dataset.schemaVersion, '1.0')
  const invalidValues = []
  const names = new Set()
  for (const member of dataset.members ?? []) {
    const key = normalizeName(member.name)
    if (names.has(key)) invalidValues.push({ name: member.name, field: 'name', reason: 'duplicate dataset name' })
    names.add(key)

    if (member.contact?.type === 'email' && !normalizeEmail(member.contact.value).includes('@')) {
      invalidValues.push({ name: member.name, field: 'email', value: member.contact.value })
    }
    if (['linkedin', 'github'].includes(member.contact?.type)) {
      try {
        normalizeUrl(member.contact.value)
      } catch {
        invalidValues.push({ name: member.name, field: member.contact.type, value: member.contact.value })
      }
    }

    for (const field of ['orcid', 'cienciaId', 'openalexId', 'tecnicoId']) {
      if (!validateIdentifier(field, member.identifiers?.[field])) {
        invalidValues.push({ name: member.name, field, value: member.identifiers[field] })
      }
    }
  }
  return invalidValues
}
