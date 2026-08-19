import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DESCRIPTIONS } from '../lib/project-descriptions.mjs'

test('every description names the record it was written from', () => {
  // The point of this file is that no sentence about a real research project is
  // invented. A source URL is what makes that checkable by the next person, so an
  // entry without one is not publishable however good the prose reads.
  for (const entry of DESCRIPTIONS) {
    assert.ok(entry.title, 'entry is missing a title')
    assert.match(entry.source ?? '', /^https?:\/\//, `${entry.title}: source must be a URL`)
    assert.ok(entry.text?.length > 80, `${entry.title}: text is too short to be a description`)
  }
})

test('a description actually mentions its project', () => {
  // Guards the copy-paste failure this format invites: right acronym in `title`,
  // another project's paragraph in `text`. Nobody would catch it by reading a
  // report of nine rows that all say "described".
  for (const entry of DESCRIPTIONS) {
    const haystack = entry.text.toLowerCase()
    const acronym = entry.title.toLowerCase()
    assert.ok(haystack.includes(acronym), `${entry.title}: text never names the project`)
  }
})

test('no project is described twice', () => {
  // Two entries for one title means the second silently loses: the importer skips
  // anything that already has a description, including one it just wrote.
  const titles = DESCRIPTIONS.map((entry) => entry.title.toLowerCase())
  assert.equal(new Set(titles).size, titles.length, 'duplicate title in DESCRIPTIONS')
})

test('all nine projects from the group page are covered', () => {
  // The list is closed and small. Coverage is the whole point of the file — a
  // project left out scores 0.28 against the chat's 0.40 floor and cannot surface
  // for any question, which reads as "the group has no projects".
  const expected = [
    'OLISSIPO',
    'EXCELERATE',
    'BioData',
    'PRELUNA',
    'ILU',
    'INTAKE',
    'NEURONREDUCE',
    'PRECISE',
    'DeepPathCOVIDx',
  ]
  const have = new Set(DESCRIPTIONS.map((entry) => entry.title.toLowerCase()))
  for (const title of expected) {
    assert.ok(have.has(title.toLowerCase()), `${title} has no description`)
  }
})
