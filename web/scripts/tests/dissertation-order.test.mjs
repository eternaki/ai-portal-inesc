import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { STAGE_ORDER, declaredStageOrder, listSortFields } from '../lib/dissertation-order.mjs'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path) => readFileSync(join(web, path), 'utf8')

const COLLECTION = 'src/collections/Dissertations.ts'
const PAGE = 'src/app/(frontend)/dissertations/page.tsx'

test('the collection declares the stages in the order the page lists them', () => {
  // Payload turns these options into a Postgres enum, and an enum sorts by
  // declaration order. Alphabetising this list would silently reorder the page.
  assert.deepEqual(declaredStageOrder(read(COLLECTION)), STAGE_ORDER)
})

test('the page sorts status ascending, so open topics come first', () => {
  const [primary, ...rest] = listSortFields(read(PAGE))
  assert.equal(
    primary,
    'status',
    'the dissertations list must sort by status first — that is what puts open topics above the archive',
  )
  assert.deepEqual(rest, ['-createdAt'], 'newest first within a stage')
})

// Everything below proves the two tests above can actually fail. The bug they
// guard was shipped after being "verified" against an empty table, where any
// ordering looks right; a guard that silently matches nothing would be the same
// mistake wearing a test's clothes.

test('the reader rejects the exact regression: options alphabetised', () => {
  const alphabetised = `
    { name: 'status', type: 'select', options: [
      { label: 'Finished', value: 'finished' },
      { label: 'Ongoing', value: 'ongoing' },
      { label: 'Open for application', value: 'open' },
    ] },
  `
  assert.notDeepEqual(declaredStageOrder(alphabetised), STAGE_ORDER)
})

test('the reader rejects the exact regression: sort flipped to descending', () => {
  assert.notEqual(listSortFields("sort: ['-status', '-createdAt'],")[0], 'status')
})

test('the readers throw rather than report an empty order', () => {
  // A rename or a refactor must break loudly here. Returning [] would let the
  // assertions above pass against a file that no longer says anything.
  assert.throws(() => declaredStageOrder("{ name: 'stage', type: 'select' }"), /name: 'status'/)
  assert.throws(() => declaredStageOrder("{ name: 'status', type: 'select' }"), /no `options`/)
  assert.throws(() => listSortFields('const result = await payload.find({})'), /no `sort: \[`/)
})

test('the options reader is not fooled by a neighbouring field', () => {
  // `level` also has options and is declared first in the same `row`. Reading
  // forward from the wrong anchor would silently assert against MSc/PhD.
  const both = `
    { name: 'level', type: 'select', options: [
      { label: 'MSc', value: 'msc' },
      { label: 'PhD', value: 'phd' },
    ] },
    { name: 'status', type: 'select', options: [
      { label: 'Open for application', value: 'open' },
      { label: 'Ongoing', value: 'ongoing' },
      { label: 'Finished', value: 'finished' },
    ] },
  `
  assert.deepEqual(declaredStageOrder(both), STAGE_ORDER)
})
