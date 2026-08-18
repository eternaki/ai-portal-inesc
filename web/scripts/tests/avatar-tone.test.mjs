import assert from 'node:assert/strict'
import test from 'node:test'

import { AVATAR_TONES, avatarTone } from '../../src/lib/avatar-tone.mjs'

// Names built the way the roster's are: Portuguese given/family names, accents
// included, so the spread check runs on something shaped like the real data.
const GIVEN = [
  'Ana', 'João', 'Maria', 'Pedro', 'Sofia', 'Miguel', 'Inês', 'Rui',
  'Beatriz', 'Tiago', 'Catarina', 'André', 'Mariana', 'Gonçalo', 'Rita',
]
const FAMILY = [
  'Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues',
  'Martins', 'Lopes', 'Marques', 'Almeida', 'Carvalho',
]
const ROSTER = GIVEN.flatMap((given) => FAMILY.map((family) => `${given} ${family}`))

test('a name always gets the same tone', () => {
  // The colour is stored nowhere, so stability across calls, pages, rebuilds and
  // machines is the whole contract. If this drifts, a person changes colour.
  for (const name of ROSTER.slice(0, 20)) {
    assert.equal(avatarTone(name), avatarTone(name))
  }
  assert.equal(avatarTone('Arlindo L. Oliveira'), avatarTone('Arlindo L. Oliveira'))
})

test('every tone is a real slot in the stylesheet', () => {
  for (const name of ROSTER) {
    const tone = avatarTone(name)
    assert.ok(Number.isInteger(tone) && tone >= 0 && tone < AVATAR_TONES, `${name} → ${tone}`)
  }
})

test('odd names still land on a slot rather than blowing up', () => {
  // The avatar must render for whatever the CMS holds; a missing name is a
  // content problem, not a reason for the page to fail.
  for (const value of ['', ' ', undefined, null, '李雷', 'Ana-Maria O’Brien', '—']) {
    const tone = avatarTone(value)
    assert.ok(Number.isInteger(tone) && tone >= 0 && tone < AVATAR_TONES, `${value} → ${tone}`)
  }
})

test('the tones are spread, so a group does not come out one colour', () => {
  // A whole role group renders at once. If the hash clustered, a screen of
  // forty-five students would go back to looking like one repeated broken image
  // — which is the entire failure this replaced.
  const counts = new Array(AVATAR_TONES).fill(0)
  for (const name of ROSTER) counts[avatarTone(name)] += 1

  assert.ok(Math.min(...counts) > 0, `some tone is never used: ${counts.join(',')}`)
  const expected = ROSTER.length / AVATAR_TONES
  assert.ok(
    Math.max(...counts) < expected * 2,
    `tones are lopsided: ${counts.join(',')} (expected about ${expected.toFixed(1)} each)`,
  )
})

test('one changed letter moves the tone', () => {
  // Two people whose names differ only slightly are exactly the pair most likely
  // to sit next to each other in an alphabetical group.
  const moved = ['Ana Silva', 'Ana Silvo', 'Ana Sila', 'Anna Silva'].map(avatarTone)
  assert.ok(new Set(moved).size > 1, `near-identical names all got tone ${moved[0]}`)
})
