import assert from 'node:assert/strict'
import test from 'node:test'

import { PHOTO_ALIASES, aliasedMemberName } from '../lib/legacy-photo-aliases.mjs'

test('resolves a pinned photo file to its member', () => {
  assert.equal(aliasedMemberName('public/playground_assets/gravo.jpeg'), 'Gonçalo Goulart Oliveira')
  assert.equal(aliasedMemberName('public/playground_assets/VincenteSilvestre.png'), 'Vicente Silvestre')
  assert.equal(aliasedMemberName('public/playground_assets/OleksanderS.jpeg'), 'Oleksandr Stopchak')
  assert.equal(aliasedMemberName('public/playground_assets/JoaoMeneses.jpg'), 'João Meneses Santos')
})

test('returns null for a file that is not pinned', () => {
  // Everything the ordinary rules already resolve must fall through, or the
  // allowlist quietly becomes the matcher.
  assert.equal(aliasedMemberName('public/playground_assets/GoncaloOliveira.jpg'), null)
  assert.equal(aliasedMemberName('public/playground_assets/DavidCalhas.jpeg'), null)
  assert.equal(aliasedMemberName(''), null)
  assert.equal(aliasedMemberName(null), null)
})

test('no two aliases claim the same file or the same member', () => {
  // Two rows pointing at one member would race for a single photo slot; two rows
  // for one file would make the winner depend on array order.
  const files = PHOTO_ALIASES.map((row) => row.file)
  const members = PHOTO_ALIASES.map((row) => row.member)
  assert.equal(new Set(files).size, files.length)
  assert.equal(new Set(members).size, members.length)
})

test('the two Gonçalo cards resolve to two different members', () => {
  // The whole point of the gravo.jpeg pin: the unpinned card belongs to the member
  // whose name matches it exactly, this one to the other Gonçalo.
  assert.equal(aliasedMemberName('public/playground_assets/gravo.jpeg'), 'Gonçalo Goulart Oliveira')
  assert.notEqual(aliasedMemberName('public/playground_assets/gravo.jpeg'), 'Gonçalo Oliveira')
})
