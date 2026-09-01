// Deciding whether two publication records are the same work, and which of them
// to keep. Pure: plain objects in, a decision out — no network, no Payload — so
// every rule here is unit-tested before it is allowed to delete anything.
//
// OpenAlex indexes the same paper more than once: the IEEE record and the ACM
// record of one conference paper, an arXiv preprint and the proceedings version,
// a repository copy with no abstract. Those are one entry on a group's
// publication list, not several.

/** Accent- and punctuation-blind, for comparing names written by two indexers. */
export function foldName(value) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The surname of one author, however the source chose to write the name.
 *
 * Sources disagree on everything except the family name: "Rajeev Murgai" and
 * "R. Murgai", "Alexandra M. Carvalho" and "Carvalho, A.M.", "Alexandre Borges"
 * and "Alexandre Secorun Borges". Comparing full strings marked eight of the
 * twenty-three pairs as different papers when all eight were the same paper.
 */
export function surnameOf(name) {
  const folded = foldName(name)
  if (!folded) return ''
  // "Carvalho, A.M." — everything before the comma is the family name.
  if (folded.includes(',')) return folded.split(',')[0].trim().split(' ').pop() ?? ''
  const parts = folded.split(' ').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** Multiset of surnames, order-insensitive: two indexers also disagree on order. */
export function surnameKey(authors) {
  return (authors ?? [])
    .map((a) => surnameOf(typeof a === 'string' ? a : a?.name))
    .filter(Boolean)
    .sort()
    .join('|')
}

/**
 * Are these two records the same work?
 *
 * Title equality is assumed (the caller groups on it) and is doing most of the
 * work; this is the second gate. Two papers sharing a title *and* an author team
 * are the same paper — the remaining differences are which index they came from.
 */
export function isSameWork(a, b, { maxYearGap = 3 } = {}) {
  const keyA = surnameKey(a.authors)
  const keyB = surnameKey(b.authors)
  if (!keyA || !keyB) return { same: false, reason: 'one record has no authors' }
  if (keyA !== keyB) return { same: false, reason: 'different author teams' }

  const yearA = Number(a.year) || 0
  const yearB = Number(b.year) || 0
  if (yearA && yearB && Math.abs(yearA - yearB) > maxYearGap) {
    return { same: false, reason: `years ${yearA} and ${yearB} are too far apart` }
  }
  return { same: true, reason: 'same title and same author team' }
}

const isPreprint = (p) => p.type === 'preprint'

/**
 * Which record to keep. The published version outranks the preprint — that is
 * the one a reader should land on — then the better-cited, then the one with a
 * DOI, then the fuller abstract. Ties break on the lower id so a re-run makes the
 * same choice.
 */
export function pickWinner(a, b) {
  const tests = [
    (x) => (isPreprint(x) ? 0 : 1),
    (x) => Number(x.citationCount) || 0,
    (x) => (x.doi ? 1 : 0),
    (x) => (x.abstract ? x.abstract.length : 0),
    (x) => -x.id,
  ]
  for (const score of tests) {
    const sa = score(a)
    const sb = score(b)
    if (sa !== sb) return sa > sb ? { winner: a, loser: b } : { winner: b, loser: a }
  }
  return { winner: a, loser: b }
}

/**
 * Is this "abstract" actually a scrape of the index page it came from?
 *
 * One record's abstract reads "Article Free Access Share on FSM decomposition …
 * Authors: José …" — the ACM Digital Library page furniture, captured instead of
 * the paper. It is the same length as the real abstract on the duplicate, so no
 * amount of preferring-the-longer-one would have caught it, and that record wins
 * on citations. Narrow on purpose: it matches the boilerplate, not short or
 * unusual abstracts.
 */
export function looksLikeIndexerChrome(text) {
  if (!text) return false
  const head = text.slice(0, 200)
  return /article\s+(free|open)\s+access/i.test(head) || /\bshare on\b[\s\S]{0,120}\bauthors:/i.test(head)
}

/**
 * What to copy from the record being removed onto the one being kept: anything
 * the winner is missing, plus the higher citation count. Never overwrites a value
 * the winner already has — least of all a summary somebody edited by hand. The
 * one exception is an abstract that turned out to be index-page furniture.
 *
 * `doi` is deliberately absent from the list. It is `unique: true` with a real
 * index behind it, and the loser is no longer deleted — it is hidden and keeps
 * its own row, so copying its DOI onto the winner is a constraint violation that
 * no ordering can resolve. The loser keeps the DOI; the winner keeps its own.
 */
export function mergeFields(winner, loser) {
  const patch = {}
  for (const field of ['abstract', 'venue', 'originalUrl', 'pdfUrl']) {
    if (!winner[field] && loser[field]) patch[field] = loser[field]
  }

  if (
    winner.abstract &&
    loser.abstract &&
    looksLikeIndexerChrome(winner.abstract) &&
    !looksLikeIndexerChrome(loser.abstract)
  ) {
    patch.abstract = loser.abstract
  }

  const winnerCites = Number(winner.citationCount) || 0
  const loserCites = Number(loser.citationCount) || 0
  if (loserCites > winnerCites) patch.citationCount = loserCites

  const winnerHasSummary = winner.aiSummaryStatus && winner.aiSummaryStatus !== 'none'
  const loserHasSummary = loser.aiSummaryStatus && loser.aiSummaryStatus !== 'none'
  if (!winnerHasSummary && loserHasSummary) {
    patch.aiSummary = loser.aiSummary
    patch.aiSummaryStatus = loser.aiSummaryStatus
  }

  return patch
}

/**
 * Carry member links across. The two records were ingested separately, so one can
 * have an author linked to a member profile where the other has only a name —
 * dropping the loser would quietly cost that person a publication on their page.
 */
export function mergeAuthorLinks(winnerAuthors, loserAuthors) {
  const linkedBySurname = new Map()
  for (const author of loserAuthors ?? []) {
    if (!author.member) continue
    const key = surnameOf(author.name)
    if (key) linkedBySurname.set(key, author.member)
  }
  if (linkedBySurname.size === 0) return { authors: winnerAuthors, changed: 0 }

  let changed = 0
  const authors = (winnerAuthors ?? []).map((author) => {
    if (author.member) return author
    const member = linkedBySurname.get(surnameOf(author.name))
    if (!member) return author
    changed += 1
    return { ...author, member }
  })

  return { authors: changed > 0 ? authors : winnerAuthors, changed }
}


/** The editorial status a merged-away duplicate is parked in. */
export const MERGED_AWAY_STATUS = 'rejected'

/**
 * Is this record still a candidate for deduping?
 *
 * A merged-away record keeps its row so the ingest can still find it by
 * openalexId and skip it — deleting it is what made the August cleanup undo
 * itself on the next ingest run. But keeping it means the next dedupe run sees
 * the pair again, and `pickWinner` can then reverse itself: the winner has
 * absorbed the loser's citations, abstract and venue, so the first tests tie and
 * the decision falls through to the lower id. If the loser held the lower id,
 * that run hides the winner instead. Excluding parked records is what makes a
 * re-run a no-op rather than a coin flip.
 */
export function isDedupeCandidate(pub) {
  return pub?.status !== MERGED_AWAY_STATUS
}
