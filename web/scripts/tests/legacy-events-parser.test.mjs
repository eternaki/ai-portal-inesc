import assert from 'node:assert/strict'
import test from 'node:test'

import { parseEventDate, parseLegacyEventsPage } from '../lib/legacy-events-parser.mjs'

test('parseEventDate reads both abbreviated and full month names', () => {
  // The page uses both spellings — "Sep 9, 2025" and "March 15, 2022" — and a
  // parser that knows only one silently drops a fifth of the archive.
  assert.equal(parseEventDate('Sep 9, 2025'), '2025-09-09')
  assert.equal(parseEventDate('March 15, 2022'), '2022-03-15')
  assert.equal(parseEventDate('June 7, 2022'), '2022-06-07')
  assert.equal(parseEventDate('Oct 21, 2024'), '2024-10-21')
})

test('parseEventDate returns null on anything it does not recognise', () => {
  assert.equal(parseEventDate('sometime in spring'), null)
  assert.equal(parseEventDate('Smarch 4, 2022'), null)
  assert.equal(parseEventDate(''), null)
  assert.equal(parseEventDate(null), null)
})

const ENTRY = `
<div class="event-feature-card">
  <img alt="profile" src="public/playground_assets/DavidCalhas.jpg" class="event-image" />
  <div class="event-container">
    <div class="event-header">
      <h2 class="event-event-name"><span>Reading Group Meeting</span></h2>
      <span class="event-event-date"><span>Sep 9, 2025</span></span>
    </div>
    <div class="event-container1">
      <a href="https://arxiv.org/abs/2507.10143" target="_blank" rel="noreferrer noopener" class="event-link">
        <span>
          Deep Feedback Models
        </span>
      </a>
      <span class="event-text"><span>presented by</span></span>
      <span class="event-text2"><span>David Calhas</span></span>
    </div>
  </div>
</div>`

test('parseLegacyEventsPage reads title, date, presenter and link', () => {
  const rows = parseLegacyEventsPage(ENTRY)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    title: 'Deep Feedback Models',
    date: '2025-09-09',
    speaker: 'David Calhas',
    link: 'https://arxiv.org/abs/2507.10143',
    kind: 'Reading Group Meeting',
  })
})

test('parseLegacyEventsPage tolerates the whitespace the source varies', () => {
  // Roughly a quarter of the entries put newlines between the tags. Matching the
  // tight spelling only would have read 63 of 83 without failing.
  const loose = ENTRY.replace(
    '<span class="event-event-date"><span>Sep 9, 2025</span></span>',
    '<span class="event-event-date">\n  <span>\n    Sep 9, 2025\n  </span>\n</span>',
  ).replace(
    '<span class="event-text2"><span>David Calhas</span></span>',
    '<span class="event-text2">\n  <span>\n    David Calhas\n  </span>\n</span>',
  )
  const rows = parseLegacyEventsPage(loose)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].date, '2025-09-09')
  assert.equal(rows[0].speaker, 'David Calhas')
})

test('parseLegacyEventsPage keeps an entry whose date it cannot read, with a null date', () => {
  // Losing the record entirely would hide it; a null date is visible in the report
  // and can be fixed by hand.
  const rows = parseLegacyEventsPage(ENTRY.replace('Sep 9, 2025', 'sometime'))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].date, null)
  assert.equal(rows[0].title, 'Deep Feedback Models')
})

test('parseLegacyEventsPage returns an empty list for markup it does not recognise', () => {
  assert.deepEqual(parseLegacyEventsPage('<div>nothing here</div>'), [])
})
