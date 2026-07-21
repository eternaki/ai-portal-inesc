import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildIndexes,
  buildUpdatePayload,
  firstLastKey,
  matchMember,
  normalizeEmail,
  normalizeName,
  normalizeUrl,
  validateDataset,
  validateIdentifier,
} from '../lib/member-importer.mjs'

test('normalizes names with accents and whitespace', () => {
  assert.equal(normalizeName('  João   Veríssimo  '), 'joao verissimo')
  assert.equal(firstLastKey('Arlindo L. Oliveira'), 'arlindo oliveira')
})

test('normalizes email and public profile URLs', () => {
  assert.equal(normalizeEmail(' USER@Tecnico.Ulisboa.PT '), 'user@tecnico.ulisboa.pt')
  assert.equal(normalizeUrl('https://pt.linkedin.com/in/lucas-piper/?x=1#top'), 'https://www.linkedin.com/in/lucas-piper')
  assert.equal(normalizeUrl('https://www.github.com/GaspTO/'), 'https://github.com/GaspTO')
})

test('validates academic identifier formats', () => {
  assert.equal(validateIdentifier('orcid', '0000-0002-2212-339X'), true)
  assert.equal(validateIdentifier('cienciaId', 'E718-A5FB-4F7D'), true)
  assert.equal(validateIdentifier('tecnicoId', 'ist12282'), true)
  assert.equal(validateIdentifier('openalexId', 'A5001327675'), true)
  assert.equal(validateIdentifier('orcid', 'bad-orcid'), false)
})

test('matches existing records by first and last name when unique', () => {
  const indexes = buildIndexes([{ id: 1, name: 'Arlindo L. Oliveira' }])
  const match = matchMember({ name: 'Arlindo Oliveira' }, indexes)
  assert.equal(match.status, 'matched')
  assert.equal(match.doc.id, 1)
})

test('does not overwrite conflicting non-empty identifiers', () => {
  const existing = { id: 1, name: 'Example', orcid: '0000-0000-0000-0001' }
  const { patch, fieldUpdates, conflicts } = buildUpdatePayload(
    existing,
    {
      name: 'Example',
      identifiers: {
        status: 'verified',
        confidence: 'high',
        sourceUrl: 'https://orcid.org/0000-0000-0000-0002',
        orcid: '0000-0000-0000-0002',
      },
    },
    '2026-07-21T00:00:00.000Z',
  )

  assert.equal(patch.orcid, undefined)
  assert.equal(conflicts.length, 1)
  assert.equal(fieldUpdates.includes('orcid'), false)
})

test('skips invalid dataset values before import', () => {
  const invalid = validateDataset({
    schemaVersion: '1.0',
    members: [
      {
        name: 'Bad',
        contact: { type: 'email', value: 'not-an-email' },
        identifiers: { status: 'verified', orcid: 'bad' },
      },
    ],
  })
  assert.equal(invalid.length, 2)
})
