import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import 'dotenv/config'

import {
  buildMemberAliasIndex,
  matchAuthorToMember,
  summarizeUnmatched,
} from './lib/publication-member-linker.mjs'

const require = createRequire(import.meta.url)
const pgPath = require.resolve('pg', { paths: [require.resolve('@payloadcms/db-postgres')] })
const { Client } = require(pgPath)

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const dataArg = process.argv.find((arg) => arg.startsWith('--data='))
const reportArg = process.argv.find((arg) => arg.startsWith('--report='))

const webRoot = path.resolve(import.meta.dirname, '..')
const dataPath = dataArg ? dataArg.slice('--data='.length) : path.join(webRoot, 'data', 'mlkd-members-update.json')
const reportPath = reportArg
  ? reportArg.slice('--report='.length)
  : path.join(webRoot, 'reports', `publication-member-links-${apply ? 'apply' : 'dry-run'}.json`)

const dataset = JSON.parse(await readFile(dataPath, 'utf8'))
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const user = process.env.POSTGRES_USER || 'mlkd'
  const password = process.env.POSTGRES_PASSWORD || 'mlkd'
  const database = process.env.POSTGRES_DB || 'mlkd'
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:5432/${database}`
}

const client = new Client({ connectionString: databaseUrl() })
await client.connect()

const report = {
  mode: apply ? 'apply' : 'dry-run',
  totalAuthorRows: 0,
  alreadyLinked: 0,
  linkableRows: 0,
  updatedRows: [],
  publicationsTouched: [],
  ambiguous: [],
  unmatchedTop: [],
}

try {
  const members = (await client.query('SELECT id, name FROM members ORDER BY id')).rows
  const authors = (
    await client.query(`
      SELECT
        pa.id,
        pa.name,
        pa.member_id,
        pa._parent_id AS publication_id,
        p.title AS publication_title
      FROM publications_authors pa
      JOIN publications p ON p.id = pa._parent_id
      ORDER BY pa._parent_id, pa._order, pa.id
    `)
  ).rows

  report.totalAuthorRows = authors.length
  report.alreadyLinked = authors.filter((row) => row.member_id).length

  const aliasToMembers = buildMemberAliasIndex(members, dataset.members)
  const unmatched = []
  const touched = new Map()

  for (const row of authors) {
    if (row.member_id) continue
    const match = matchAuthorToMember(row.name, aliasToMembers)
    if (match.status === 'matched') {
      report.linkableRows += 1
      const update = {
        authorRowId: row.id,
        publicationId: row.publication_id,
        publicationTitle: row.publication_title,
        authorName: row.name,
        memberId: match.member.id,
        memberName: match.member.name,
      }
      report.updatedRows.push(update)
      touched.set(row.publication_id, row.publication_title)
      if (apply) {
        await client.query('UPDATE publications_authors SET member_id=$1 WHERE id=$2', [match.member.id, row.id])
      }
    } else if (match.status === 'ambiguous') {
      report.ambiguous.push({
        authorRowId: row.id,
        publicationId: row.publication_id,
        authorName: row.name,
        reason: match.reason,
        candidates: match.candidates,
      })
    } else {
      unmatched.push(row)
    }
  }

  if (apply && touched.size > 0) {
    await client.query('UPDATE publications SET updated_at=now() WHERE id = ANY($1)', [[...touched.keys()]])
  }

  report.publicationsTouched = [...touched.entries()].map(([id, title]) => ({ id, title }))
  report.unmatchedTop = summarizeUnmatched(unmatched)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    mode: report.mode,
    totalAuthorRows: report.totalAuthorRows,
    alreadyLinked: report.alreadyLinked,
    linkableRows: report.linkableRows,
    publicationsTouched: report.publicationsTouched.length,
    ambiguous: report.ambiguous.length,
    reportPath,
  }, null, 2))
} finally {
  await client.end()
}
