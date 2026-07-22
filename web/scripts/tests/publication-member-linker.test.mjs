import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMemberAliasIndex,
  matchAuthorToMember,
  normalizeName,
  repairMojibake,
} from '../lib/publication-member-linker.mjs'

test('normalizes accents and dash variants', () => {
  assert.equal(normalizeName('João Marques‐Silva'), 'joao marques-silva')
})

test('repairs common mojibake from source JSON', () => {
  assert.equal(repairMojibake('AndrÃ© Duarte'), 'André Duarte')
})

test('matches abbreviated middle-name author to member full name', () => {
  const index = buildMemberAliasIndex(
    [{ id: 4, name: 'André Duarte' }],
    [{ name: 'André Duarte', fullName: 'André Vicente Duarte' }],
  )
  const match = matchAuthorToMember('André V. Duarte', index)
  assert.equal(match.status, 'matched')
  assert.equal(match.member.id, 4)
})

test('matches first second last author to longer member full name', () => {
  const index = buildMemberAliasIndex(
    [{ id: 18, name: 'João Silva' }],
    [{ name: 'João Silva', fullName: 'João Lourenço Coelho da Silva' }],
  )
  const match = matchAuthorToMember('João Lourenço Silva', index)
  assert.equal(match.status, 'matched')
  assert.equal(match.member.id, 18)
})

test('does not guess when an alias is ambiguous', () => {
  const index = buildMemberAliasIndex(
    [
      { id: 1, name: 'João Pedro' },
      { id: 2, name: 'João Pedro' },
    ],
    [],
  )
  const match = matchAuthorToMember('João Pedro', index)
  assert.equal(match.status, 'ambiguous')
})
