import assert from 'node:assert/strict'
import test from 'node:test'

import { contrast, flatten, parseColor } from '../audit-contrast.mjs'

test('contrast matches the WCAG reference points', () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]).toFixed(0), '21')
  assert.equal(contrast([255, 255, 255], [255, 255, 255]).toFixed(0), '1')
  // The failure this audit exists to catch: white on the dark theme's pale cobalt.
  assert.ok(contrast([255, 255, 255], [127, 166, 242]) < 3)
})

test('contrast is symmetric', () => {
  const a = contrast([27, 42, 65], [246, 247, 244])
  const b = contrast([246, 247, 244], [27, 42, 65])
  assert.equal(a.toFixed(4), b.toFixed(4))
})

test('parseColor reads the notations the stylesheet uses', () => {
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1])
  assert.deepEqual(parseColor('#1b2a41'), [27, 42, 65, 1])
  assert.deepEqual(parseColor('rgba(27, 42, 65, 0.72)'), [27, 42, 65, 0.72])
  assert.deepEqual(parseColor('rgb(27, 42, 65)'), [27, 42, 65, 1])
})

test('parseColor returns null rather than guessing', () => {
  // A gradient or a keyword must not be silently treated as a colour, or the
  // audit reports a contrast figure for a pair it never actually measured.
  assert.equal(parseColor('linear-gradient(160deg, #12203a, #0f1c33)'), null)
  assert.equal(parseColor('transparent'), null)
  assert.equal(parseColor(''), null)
  assert.equal(parseColor(undefined), null)
})

test('flatten lays a translucent colour over its backdrop', () => {
  assert.deepEqual(flatten([0, 0, 0, 0.5], [255, 255, 255]), [128, 128, 128])
  assert.deepEqual(flatten([10, 20, 30, 1], [255, 255, 255]), [10, 20, 30])
})
