import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMemberIndex, matchMember } from '../lib/member-matcher.mjs'

const MEMBERS = [
  { id: 1, name: 'Arlindo L. Oliveira' },
  { id: 2, name: 'Ruxandra Barbulescu' },
  { id: 3, name: 'Gonçalo Oliveira' },
  { id: 4, name: 'Maria Silva' },
  { id: 5, name: 'Maria Ferreira Silva' },
]

test('matches on the exact normalised name, accents and case aside', () => {
  const index = buildMemberIndex(MEMBERS)
  assert.deepEqual(matchMember({ name: 'goncalo oliveira' }, index), {
    member: MEMBERS[2],
    how: 'exact name',
  })
})

test('falls back to the name recovered from the photo filename', () => {
  // The page shows "R. Barbulescu"; only RuxandraBarbulescu.jpg identifies her.
  const index = buildMemberIndex(MEMBERS)
  assert.deepEqual(
    matchMember({ name: 'R. Barbulescu', nameFromPhoto: 'Ruxandra Barbulescu' }, index),
    { member: MEMBERS[1], how: 'photo filename' },
  )
})

test('falls back to first + last name, and says so', () => {
  const index = buildMemberIndex(MEMBERS)
  assert.deepEqual(matchMember({ name: 'Arlindo Oliveira' }, index), {
    member: MEMBERS[0],
    how: 'first + last name only',
  })
})

test('refuses a first+last key shared by two members rather than picking one', () => {
  // "Maria Silva" and "Maria Ferreira Silva" collapse to the same key. Guessing
  // here would attach someone's photo to the wrong profile.
  const index = buildMemberIndex(MEMBERS)
  assert.deepEqual(matchMember({ name: 'Maria I. Silva' }, index), { member: null, how: null })
})

test('returns no match rather than a wrong one', () => {
  const index = buildMemberIndex(MEMBERS)
  assert.deepEqual(matchMember({ name: 'Someone Unknown' }, index), { member: null, how: null })
  assert.deepEqual(matchMember({ name: '' }, index), { member: null, how: null })
})

test('prefers the exact name over the weaker passes', () => {
  const members = [
    { id: 10, name: 'Ana Costa' },
    { id: 11, name: 'Ana Maria Costa' },
  ]
  const index = buildMemberIndex(members)
  // Exact hit wins even though a first+last key also exists for the other person.
  assert.deepEqual(matchMember({ name: 'Ana Maria Costa' }, index), {
    member: members[1],
    how: 'exact name',
  })
})
