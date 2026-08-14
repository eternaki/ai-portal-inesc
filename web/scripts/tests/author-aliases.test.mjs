import assert from 'node:assert/strict'
import test from 'node:test'

import { AUTHOR_ALIASES, linkAliasInAuthors } from '../lib/author-aliases.mjs'

test('the allowlist holds the eight reviewed pairs and nothing else', () => {
  assert.equal(AUTHOR_ALIASES.length, 8)
  assert.ok(AUTHOR_ALIASES.every((p) => p.member && p.alias))
  // The ambiguous pair must never be listed: the author string "Gonçalo Oliveira"
  // matches two different members.
  assert.ok(!AUTHOR_ALIASES.some((p) => p.alias === 'Gonçalo Oliveira'))
})

test('links the matching author row and reports the change', () => {
  const authors = [
    { name: 'Arlindo L. Oliveira', member: 1 },
    { name: 'Alexandre P. Francisco', member: null },
  ]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 1)
  assert.equal(out.authors[1].member, 7)
  assert.equal(out.authors[0].member, 1, 'other authors are untouched')
})

test('matches the alias ignoring case, accents and stray whitespace', () => {
  const authors = [{ name: '  alexandre p. francisco ', member: null }]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 1)
  assert.equal(out.authors[0].member, 7)
})

test('never overwrites an author already linked to someone', () => {
  const authors = [{ name: 'Alexandre P. Francisco', member: 99 }]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 0)
  assert.equal(out.authors[0].member, 99)
})

test('reports no change when the alias is absent', () => {
  const authors = [{ name: 'Someone Else', member: null }]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 0)
  assert.deepEqual(out.authors, authors)
})

test('keeps a member object rather than flattening it to an id', () => {
  // Payload returns relationships as objects at depth > 0; the writer must not
  // clobber an existing link just because it is shaped differently.
  const authors = [{ name: 'Alexandre P. Francisco', member: { id: 99 } }]
  const out = linkAliasInAuthors(authors, 'Alexandre P. Francisco', 7)
  assert.equal(out.changed, 0)
})
