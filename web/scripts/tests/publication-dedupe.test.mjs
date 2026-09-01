import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isDedupeCandidate,
  MERGED_AWAY_STATUS,
  isSameWork,
  looksLikeIndexerChrome,
  mergeAuthorLinks,
  mergeFields,
  pickWinner,
  surnameKey,
  surnameOf,
} from '../lib/publication-dedupe.mjs'

test('surnameOf survives every spelling the indexers use', () => {
  // All four pairs below are real: they are why comparing full name strings
  // called eight identical papers "different author teams".
  assert.equal(surnameOf('Rajeev Murgai'), surnameOf('R. Murgai'))
  assert.equal(surnameOf('Alexandra M. Carvalho'), surnameOf('Carvalho, A.M.'))
  assert.equal(surnameOf('Alexandre Borges'), surnameOf('Alexandre Secorun Borges'))
  assert.equal(surnameOf('Catarina Oliveira'), surnameOf('Catarina R. Oliveira'))
  assert.equal(surnameOf('Marie‐France Sagot'), surnameOf('Sagot, M.-F.'))
})

test('surnameKey ignores author order', () => {
  // CountPath lists the same six people with two of them swapped.
  const a = [{ name: 'Diana Montezuma' }, { name: 'Tomé Albuquerque' }]
  const b = [{ name: 'Tomé Albuquerque' }, { name: 'Diana Montezuma' }]
  assert.equal(surnameKey(a), surnameKey(b))
})

test('isSameWork accepts a preprint and its published version', () => {
  const preprint = { year: 2021, authors: [{ name: 'A. Silva' }, { name: 'B. Costa' }] }
  const published = { year: 2022, authors: [{ name: 'Ana Silva' }, { name: 'Bruno Costa' }] }
  assert.equal(isSameWork(preprint, published).same, true)
})

test('isSameWork refuses a different author team', () => {
  const a = { year: 2020, authors: [{ name: 'Ana Silva' }] }
  const b = { year: 2020, authors: [{ name: 'Bruno Costa' }] }
  const result = isSameWork(a, b)
  assert.equal(result.same, false)
  assert.match(result.reason, /author teams/)
})

test('isSameWork refuses records a decade apart', () => {
  // Same title, same team, but a re-run of a study years later is its own work.
  const a = { year: 2004, authors: [{ name: 'Ana Silva' }] }
  const b = { year: 2019, authors: [{ name: 'Ana Silva' }] }
  assert.equal(isSameWork(a, b).same, false)
})

test('isSameWork refuses when either side has no authors', () => {
  const a = { year: 2020, authors: [] }
  const b = { year: 2020, authors: [{ name: 'Ana Silva' }] }
  assert.equal(isSameWork(a, b).same, false)
})

test('pickWinner keeps the published version over the preprint', () => {
  const preprint = { id: 1, type: 'preprint', citationCount: 40, doi: 'x', abstract: 'long text' }
  const published = { id: 2, type: 'conference', citationCount: 3, doi: null, abstract: null }
  assert.equal(pickWinner(preprint, published).winner.id, 2)
})

test('pickWinner falls through to citations, then DOI, then abstract', () => {
  const a = { id: 1, type: 'journal', citationCount: 30, doi: 'a', abstract: 'aa' }
  const b = { id: 2, type: 'journal', citationCount: 33, doi: 'b', abstract: 'bb' }
  assert.equal(pickWinner(a, b).winner.id, 2)

  const c = { id: 3, type: 'journal', citationCount: 5, doi: null, abstract: 'longer' }
  const d = { id: 4, type: 'journal', citationCount: 5, doi: 'yes', abstract: '' }
  assert.equal(pickWinner(c, d).winner.id, 4)
})

test('pickWinner is stable, so a re-run decides the same way', () => {
  const a = { id: 7, type: 'journal', citationCount: 1, doi: 'x', abstract: 'same' }
  const b = { id: 9, type: 'journal', citationCount: 1, doi: 'y', abstract: 'same' }
  assert.equal(pickWinner(a, b).winner.id, pickWinner(b, a).winner.id)
})

test('mergeFields fills gaps and never overwrites', () => {
  const winner = { doi: 'keep-me', abstract: null, citationCount: 3 }
  const loser = { doi: 'other', abstract: 'recovered', citationCount: 30, venue: 'ICCAD' }
  const patch = mergeFields(winner, loser)
  assert.equal(patch.doi, undefined)
  assert.equal(patch.abstract, 'recovered')
  assert.equal(patch.venue, 'ICCAD')
  assert.equal(patch.citationCount, 30)
})

test('mergeFields never replaces a summary a human edited', () => {
  const winner = { aiSummaryStatus: 'edited', aiSummary: { tldr: 'written by hand' } }
  const loser = { aiSummaryStatus: 'generated', aiSummary: { tldr: 'machine' } }
  assert.equal(mergeFields(winner, loser).aiSummary, undefined)
})

test('mergeFields takes a summary when the winner has none', () => {
  const winner = { aiSummaryStatus: 'none' }
  const loser = { aiSummaryStatus: 'generated', aiSummary: { tldr: 'machine' } }
  assert.deepEqual(mergeFields(winner, loser).aiSummary, { tldr: 'machine' })
})

test('mergeAuthorLinks rescues member links from the record being deleted', () => {
  // Without this the person loses the paper from their profile page.
  const winnerAuthors = [{ name: 'R. Murgai' }, { name: 'Arlindo L. Oliveira' }]
  const loserAuthors = [{ name: 'Rajeev Murgai', member: 42 }, { name: 'Arlindo L. Oliveira', member: 1 }]
  const { authors, changed } = mergeAuthorLinks(winnerAuthors, loserAuthors)
  assert.equal(changed, 2)
  assert.equal(authors[0].member, 42)
  assert.equal(authors[1].member, 1)
})

test('mergeAuthorLinks leaves an existing link alone', () => {
  const winnerAuthors = [{ name: 'Ana Silva', member: 5 }]
  const loserAuthors = [{ name: 'Ana Silva', member: 9 }]
  const { authors, changed } = mergeAuthorLinks(winnerAuthors, loserAuthors)
  assert.equal(changed, 0)
  assert.equal(authors[0].member, 5)
})

test('looksLikeIndexerChrome spots a scraped index page, not a real abstract', () => {
  const chrome =
    'Article Free Access Share on FSM decomposition by direct circuit manipulation ' +
    'applied to low power design Authors: José Monteiro, Arlindo Oliveira'
  const real =
    'Clock-gating techniques are very effective in the reduction of the switching ' +
    'activity in sequential logic circuits. In particular, we show that...'
  assert.equal(looksLikeIndexerChrome(chrome), true)
  assert.equal(looksLikeIndexerChrome(real), false)
  assert.equal(looksLikeIndexerChrome(''), false)
  assert.equal(looksLikeIndexerChrome(null), false)
})

test('mergeFields swaps a chrome abstract for the real one on the duplicate', () => {
  // The record that wins on citations carries the ACM page furniture; the one
  // about to be deleted holds the actual abstract, and it is the same length,
  // so nothing but recognising the boilerplate would save it.
  const winner = { abstract: 'Article Free Access Share on X Authors: Y', citationCount: 13 }
  const loser = { abstract: 'Clock-gating techniques are very effective...', citationCount: 2 }
  assert.equal(mergeFields(winner, loser).abstract, loser.abstract)
})

test('mergeFields keeps a real abstract even when the duplicate has one too', () => {
  const winner = { abstract: 'A genuine abstract about motifs in DNA.' }
  const loser = { abstract: 'A different genuine abstract.' }
  assert.equal(mergeFields(winner, loser).abstract, undefined)
})


// --- parking, not deleting -------------------------------------------------

test('a parked duplicate is not a candidate again', () => {
  // The whole point of parking rather than deleting: ingest still finds the row
  // by openalexId and skips it. But a second dedupe run must then leave it
  // alone, or pickWinner re-decides a settled pair on a tie-break and can hide
  // the record it kept last time.
  assert.equal(isDedupeCandidate({ id: 1, status: 'published' }), true)
  assert.equal(isDedupeCandidate({ id: 2, status: MERGED_AWAY_STATUS }), false)
})

test('a re-run over already-merged records finds nothing to do', () => {
  // The regression this guards is silent: no error, no crash, just a winner
  // quietly swapped for the record it replaced.
  const winner = { id: 9, status: 'published', title: 'A paper', type: 'article' }
  const parked = { id: 3, status: MERGED_AWAY_STATUS, title: 'A paper', type: 'preprint' }
  const survivors = [winner, parked].filter(isDedupeCandidate)
  assert.deepEqual(survivors, [winner])
})

test('the DOI stays with the record that keeps its row', () => {
  // doi is unique in the database. While the loser was deleted this copy was
  // fine; now that it keeps its row, copying would be a constraint violation no
  // ordering can resolve.
  const patch = mergeFields(
    { id: 1, doi: null, abstract: 'kept' },
    { id: 2, doi: '10.1000/xyz', abstract: 'other' },
  )
  assert.equal('doi' in patch, false)
})
