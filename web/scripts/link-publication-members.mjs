/**
 * Link publication author rows to member profiles.
 *
 * Run:  pnpm publications:link-members                     (dry run, writes a report)
 *       PUBLICATION_LINKS_APPLY=1 pnpm publications:link-members:apply
 *
 * Publications carry authors as plain names; a member profile only shows a paper
 * once the author row points at it. The matching rules live in
 * lib/publication-member-linker.mjs and are unit-tested.
 *
 * Writes through Payload's Local API. The previous version connected to Postgres
 * and issued `UPDATE publications_authors SET member_id=...`, which the ownership
 * rule in CLAUDE.md §3 forbids: content belongs to Payload, and going round it
 * skips validation, hooks and access control.
 *
 * Going through Payload does mean the publication's afterChange hook runs, and
 * that hook asks the AI service to summarise anything with an abstract and no
 * summary — 200-odd LLM calls for a job that only touches author links. Every
 * write here is therefore tagged `x-skip-autoprocess`, the same header the AI
 * service tags its own writes with, which is exactly what it is for.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

import {
  buildMemberAliasIndex,
  matchAuthorToMember,
  summarizeUnmatched,
} from './lib/publication-member-linker.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const apply = process.env.PUBLICATION_LINKS_APPLY === '1'

// Tagged so the batch does not trigger a summary run per publication.
const skipAutoprocess = { headers: new Headers({ 'x-skip-autoprocess': '1' }) }

async function run() {
  const payload = await getPayload({ config })

  const dataset = JSON.parse(
    await readFile(path.join(repoRoot, 'data', 'mlkd-members-update.json'), 'utf8'),
  )

  const members = (await payload.find({ collection: 'members', limit: 1000, depth: 0 })).docs
  const publications = (
    await payload.find({ collection: 'publications', limit: 5000, depth: 0 })
  ).docs

  const aliasToMembers = buildMemberAliasIndex(members, dataset.members)

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    totalAuthorRows: 0,
    alreadyLinked: 0,
    linkableRows: 0,
    updatedRows: [],
    publicationsTouched: [],
    ambiguous: [],
    unmatchedTop: [],
    errors: [],
  }

  const unmatched = []

  for (const publication of publications) {
    const authors = publication.authors ?? []
    report.totalAuthorRows += authors.length

    let changed = 0
    const next = authors.map((author) => {
      if (author.member) {
        report.alreadyLinked += 1
        return author
      }

      const match = matchAuthorToMember(author.name, aliasToMembers)
      if (match.status === 'matched') {
        report.linkableRows += 1
        changed += 1
        report.updatedRows.push({
          publicationId: publication.id,
          publicationTitle: publication.title,
          authorName: author.name,
          memberId: match.member.id,
          memberName: match.member.name,
        })
        return { ...author, member: match.member.id }
      }

      if (match.status === 'ambiguous') {
        report.ambiguous.push({
          publicationId: publication.id,
          authorName: author.name,
          reason: match.reason,
          candidates: match.candidates,
        })
      } else {
        unmatched.push({ name: author.name })
      }
      return author
    })

    if (changed === 0) continue
    report.publicationsTouched.push({ id: publication.id, title: publication.title, linked: changed })

    if (!apply) continue
    try {
      await payload.update({
        collection: 'publications',
        id: publication.id,
        data: { authors: next },
        req: skipAutoprocess,
      })
    } catch (err) {
      report.errors.push({ id: publication.id, message: String(err?.message ?? err) })
    }
  }

  report.unmatchedTop = summarizeUnmatched(unmatched)

  const reportPath = path.join(
    repoRoot,
    'reports',
    `publication-member-links-${apply ? 'apply' : 'dry-run'}.json`,
  )
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.totalAuthorRows} author rows, ${report.alreadyLinked} already linked, ` +
      `${report.linkableRows} newly linked across ${report.publicationsTouched.length} publication(s), ` +
      `${report.ambiguous.length} ambiguous, ${report.errors.length} errors`,
  )
  console.log(`report → ${reportPath}`)
}

await run()
