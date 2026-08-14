/**
 * Import member photos from the group's legacy team page.
 *
 * Run:  pnpm photos:import                    (dry run, writes a report)
 *       MEMBER_PHOTOS_APPLY=1 pnpm photos:import:apply
 *
 * Every one of the 59 people on the legacy site has a photo; none of our 113 member
 * records has one. The photos are the group's own content, served openly, so moving
 * them across is a migration rather than a scrape. LinkedIn is deliberately not a
 * source: those pages are behind authentication and automated collection breaches
 * their terms — members without a legacy photo keep the initials avatar and can
 * upload their own through the profile self-edit.
 *
 * Writes through Payload's Local API under `payload run`, so Media gets its
 * derivative sizes and the relationship is set the way the admin panel would.
 *
 * Idempotent: a member who already has a photo is skipped, so a re-run never
 * duplicates an upload or overwrites a picture someone chose themselves.
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

const BASE = 'https://mlkd.idss.inesc-id.pt'
const TEAM_URL = `${BASE}/mlkd-team.html`
const EXPECTED_PEOPLE = 59

// `payload run` does not forward unknown command-line flags to the script, so the
// apply switch is an env var, compared strictly: any value other than "1" stays a
// dry run rather than silently writing.
const apply = process.env.MEMBER_PHOTOS_APPLY === '1'

// A first+last match (e.g. "Arlindo Oliveira" for our "Arlindo L. Oliveira") is
// reported, not acted on, because attaching the wrong face to a profile is worse
// than an initials avatar. Set this once you have read the weakMatchSkipped list
// and agree with it — that keeps the judgement with a person, where it belongs.
const includeWeak = process.env.MEMBER_PHOTOS_INCLUDE_WEAK === '1'

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const UA = { 'user-agent': 'mlkd-portal-photo-importer' }

/**
 * Fetch with a timeout and a couple of retries.
 *
 * The importer makes 60 sequential requests to one host; a single dropped
 * connection killed an earlier run before it wrote anything. Transient network
 * failure is the expected case here, not the exceptional one.
 */
async function fetchWithRetry(url, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
      return res
    } catch (err) {
      lastError = err
      if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 1500))
    }
  }
  throw lastError
}

function fileMeta(photoPath) {
  const name = photoPath.split('/').pop() ?? 'photo.jpg'
  const ext = path.extname(name).toLowerCase()
  return { name, mimetype: MIME_BY_EXT[ext] ?? 'image/jpeg' }
}

async function run() {
  const payload = await getPayload({ config })

  const legacy = parseLegacyTeamPage(await (await fetchWithRetry(TEAM_URL)).text())

  if (legacy.length !== EXPECTED_PEOPLE) {
    throw new Error(
      `parsed ${legacy.length} people from the legacy team page, expected ${EXPECTED_PEOPLE}. ` +
        `The markup probably changed — fix the parser before importing.`,
    )
  }

  const members = (await payload.find({ collection: 'members', limit: 1000, depth: 0 })).docs
  const index = buildMemberIndex(members)

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    weakMatchesIncluded: includeWeak,
    source: TEAM_URL,
    legacyPeople: legacy.length,
    uploaded: [],
    alreadyHadPhoto: [],
    unmatched: [],
    weakMatchSkipped: [],
    duplicateLegacyEntries: [],
    errors: [],
  }

  // The legacy page lists at least one person twice, under two different photo
  // files. Without this guard the second entry silently replaces the first's
  // photo and leaves an orphaned Media row behind.
  const handled = new Map()

  for (const person of legacy) {
    // A hand-pinned file wins over every rule: the rules are what mis-assigned it.
    const pinned = aliasedMemberName(person.photoPath)
    const { member, how } = pinned
      ? { member: index.byExact.get(normalizeName(pinned)) ?? null, how: 'pinned by photo file' }
      : matchMember(person, index)

    if (pinned && !member) {
      report.errors.push({
        name: person.name,
        message: `photo alias points at "${pinned}", which is not a member — fix legacy-photo-aliases.mjs`,
      })
      continue
    }

    if (!member) {
      report.unmatched.push({ name: person.name, nameFromPhoto: person.nameFromPhoto })
      continue
    }

    if (how === 'first + last name only' && !includeWeak) {
      report.weakMatchSkipped.push({ legacyName: person.name, ourName: member.name, memberId: member.id })
      continue
    }

    if (handled.has(member.id)) {
      report.duplicateLegacyEntries.push({
        memberId: member.id,
        name: member.name,
        keptFile: handled.get(member.id),
        ignoredFile: person.photoPath.split('/').pop(),
      })
      continue
    }

    if (member.photo) {
      report.alreadyHadPhoto.push({ memberId: member.id, name: member.name })
      continue
    }

    const { name: filename, mimetype } = fileMeta(person.photoPath)
    const url = `${BASE}/${person.photoPath.replace(/^\/+/, '')}`

    try {
      const data = Buffer.from(await (await fetchWithRetry(url)).arrayBuffer())

      if (apply) {
        const media = await payload.create({
          collection: 'media',
          data: { alt: member.name },
          file: { data, mimetype, name: filename, size: data.length },
        })
        await payload.update({
          collection: 'members',
          id: member.id,
          data: { photo: media.id },
        })
      }

      handled.set(member.id, filename)
      report.uploaded.push({
        memberId: member.id,
        name: member.name,
        matchedBy: how,
        filename,
        bytes: data.length,
      })
    } catch (err) {
      report.errors.push({ name: member.name, url, message: String(err?.message ?? err) })
    }
  }

  const reportPath = path.join(repoRoot, 'reports', `member-photos-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.uploaded.length} photo(s) ${apply ? 'uploaded' : 'would be uploaded'}, ` +
      `${report.alreadyHadPhoto.length} already had one, ${report.weakMatchSkipped.length} weak match skipped, ` +
      `${report.duplicateLegacyEntries.length} duplicate legacy entr(ies), ` +
      `${report.unmatched.length} unmatched, ${report.errors.length} error(s)`,
  )
  console.log(`report → ${reportPath}`)
}

await run()
