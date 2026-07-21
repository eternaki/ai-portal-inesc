import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import {
  buildCreatePayload,
  buildIndexes,
  buildUpdatePayload,
  matchMember,
  validateDataset,
} from './lib/member-importer.mjs'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const offline = args.has('--offline')
const dryRun = args.has('--dry-run') || !apply
const dataArg = process.argv.find((arg) => arg.startsWith('--data='))
const reportArg = process.argv.find((arg) => arg.startsWith('--report='))

const repoRoot = path.resolve(import.meta.dirname, '..')
const dataPath = dataArg ? dataArg.slice('--data='.length) : path.join(repoRoot, 'data', 'mlkd-members-update.json')
const reportPath = reportArg
  ? reportArg.slice('--report='.length)
  : path.join(repoRoot, 'reports', `members-import-${dryRun ? 'dry-run' : 'apply'}.json`)

const payloadUrl = (process.env.PAYLOAD_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const apiKey = process.env.PAYLOAD_API_KEY

function headers() {
  const headers = {
    'Content-Type': 'application/json',
    'X-Skip-Autoprocess': '1',
  }
  if (apiKey) headers.Authorization = `users API-Key ${apiKey}`
  return headers
}

async function payloadRequest(pathname, options = {}) {
  const response = await fetch(`${payloadUrl}/api${pathname}`, {
    ...options,
    headers: { ...headers(), ...(options.headers ?? {}) },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${options.method ?? 'GET'} ${pathname} failed: ${response.status} ${text}`)
  }
  return response.json()
}

async function fetchAllMembers() {
  const docs = []
  let page = 1
  while (true) {
    const data = await payloadRequest(`/members?limit=100&page=${page}&depth=0`)
    docs.push(...data.docs)
    if (!data.hasNextPage) return docs
    page += 1
  }
}

async function createMember(data) {
  const response = await payloadRequest('/members', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return response.doc
}

async function updateMember(id, data) {
  const response = await payloadRequest(`/members/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return response.doc
}

function compactCreateFields(data) {
  return Object.keys(data).filter((key) => !['name', 'role', 'bioAiDraft'].includes(key))
}

const dataset = JSON.parse(await readFile(dataPath, 'utf8'))
const invalidValues = validateDataset(dataset)
if (invalidValues.length) {
  const report = { updated: [], created: [], unchanged: [], unmatched: [], conflicts: [], invalidValues }
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.error(`Invalid dataset values. Report written to ${reportPath}`)
  process.exitCode = 1
} else {
  const existingMembers = offline ? [] : await fetchAllMembers()
  const indexes = buildIndexes(existingMembers)
  const now = new Date().toISOString()
  const report = {
    mode: dryRun ? 'dry-run' : 'apply',
    payloadUrl: offline ? null : payloadUrl,
    offline,
    totalInputMembers: dataset.members.length,
    existingMembers: existingMembers.length,
    created: [],
    updated: [],
    unchanged: [],
    ambiguous: [],
    conflicts: [],
    invalidValues: [],
    identifiersSkipped: [],
    privateFieldsStored: [],
  }

  for (const member of dataset.members) {
    const match = matchMember(member, indexes)
    const idStatus = member.identifiers?.status
    if (idStatus === 'ambiguous' || idStatus === 'not_found') {
      report.identifiersSkipped.push({ name: member.name, status: idStatus })
    }

    if (match.status === 'ambiguous') {
      report.ambiguous.push({ name: member.name, reason: match.reason })
      continue
    }

    if (match.status === 'new') {
      const data = buildCreatePayload(member, now, dataset.rules.defaultBio)
      if (apply) {
        const doc = await createMember(data)
        indexes.byName.set(member.name, [doc])
        report.created.push({ name: member.name, memberId: doc.id, fields: compactCreateFields(data) })
      } else {
        report.created.push({ name: member.name, fields: compactCreateFields(data) })
      }
      if (data.email) report.privateFieldsStored.push({ name: member.name, field: 'email', public: data.showEmail === true })
      continue
    }

    const { patch, fieldUpdates, conflicts } = buildUpdatePayload(match.doc, member, now)
    report.conflicts.push(...conflicts)
    if (fieldUpdates.length === 0) {
      report.unchanged.push(member.name)
      continue
    }
    if (apply && conflicts.length === 0) {
      await updateMember(match.doc.id, patch)
    }
    report.updated.push({
      name: member.name,
      memberId: match.doc.id,
      matchedBy: match.reason,
      fields: fieldUpdates,
      skippedApplyDueToConflicts: conflicts.length > 0,
    })
    if (patch.email) report.privateFieldsStored.push({ name: member.name, field: 'email', public: patch.showEmail === true })
  }

  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Members import ${dryRun ? 'dry-run' : 'apply'} report written to ${reportPath}`)
}
