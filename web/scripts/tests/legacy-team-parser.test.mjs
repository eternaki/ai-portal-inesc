import assert from 'node:assert/strict'
import test from 'node:test'

import {
  nameFromPhotoFilename,
  normalizeLegacyRole,
  parseLegacyTeamPage,
} from '../lib/legacy-team-parser.mjs'

test('normalizeLegacyRole maps every casing the legacy page uses', () => {
  // The source spells the same role four ways; a case-sensitive map silently
  // drops most of the roster.
  assert.deepEqual(normalizeLegacyRole('Group Leader'), { role: 'faculty', membershipStatus: 'active' })
  assert.deepEqual(normalizeLegacyRole('PHD Student'), { role: 'phd', membershipStatus: 'active' })
  assert.deepEqual(normalizeLegacyRole('phd Student'), { role: 'phd', membershipStatus: 'active' })
  assert.deepEqual(normalizeLegacyRole('PhD Student'), { role: 'phd', membershipStatus: 'active' })
  assert.deepEqual(normalizeLegacyRole('Student'), { role: 'msc', membershipStatus: 'active' })
  assert.deepEqual(normalizeLegacyRole('Alumni'), { role: 'alumni', membershipStatus: 'completed' })
  assert.deepEqual(normalizeLegacyRole('alumni'), { role: 'alumni', membershipStatus: 'completed' })
})

test('normalizeLegacyRole returns null for an unknown label rather than guessing', () => {
  assert.equal(normalizeLegacyRole('Visiting Wizard'), null)
  assert.equal(normalizeLegacyRole(''), null)
})

test('nameFromPhotoFilename recovers a full name from CamelCase', () => {
  // The page shows "R. Barbulescu" but the photo is RuxandraBarbulescu.jpg, so the
  // filename is the better matching signal for abbreviated entries.
  assert.equal(nameFromPhotoFilename('public/playground_assets/RuxandraBarbulescu.jpg'), 'Ruxandra Barbulescu')
  assert.equal(nameFromPhotoFilename('public/playground_assets/ArlindoOliveira.jpeg'), 'Arlindo Oliveira')
  assert.equal(nameFromPhotoFilename('AndreDuarte.png'), 'Andre Duarte')
})

test('nameFromPhotoFilename gives up on filenames that carry no name', () => {
  assert.equal(nameFromPhotoFilename('public/playground_assets/placeholder.png'), null)
  assert.equal(nameFromPhotoFilename(''), null)
  assert.equal(nameFromPhotoFilename(null), null)
})

const TEAM_HTML = `
<span class="mlkd-team-text2"><span>Current members</span></span>
<div class="member-testimonial">
  <img alt="profile" src="public/playground_assets/ArlindoOliveira.jpeg" class="member-image" />
  <span class="member-name"><span>Arlindo Oliveira</span></span>
  <span class="member-title"><span>Group Leader</span></span>
</div>
<div class="member-testimonial">
  <img alt="profile" src="public/playground_assets/BeatrizVieira.jpeg" class="member-image" />
  <span class="member-name"><span>Beatriz Vieira</span></span>
  <span class="member-title"><span>phd Student</span></span>
</div>
<span class="mlkd-team-text3"><span>Past members</span></span>
<div class="member-testimonial">
  <img alt="profile" src="public/playground_assets/RuxandraBarbulescu.jpg" class="member-image" />
  <span class="member-name"><span>R. Barbulescu</span></span>
  <span class="member-title"><span>Alumni</span></span>
</div>`

test('parseLegacyTeamPage reads name, role, photo and section', () => {
  const rows = parseLegacyTeamPage(TEAM_HTML)
  assert.equal(rows.length, 3)

  assert.deepEqual(rows[0], {
    name: 'Arlindo Oliveira',
    nameFromPhoto: 'Arlindo Oliveira',
    title: 'Group Leader',
    role: 'faculty',
    membershipStatus: 'active',
    section: 'current',
    photoPath: 'public/playground_assets/ArlindoOliveira.jpeg',
  })

  assert.equal(rows[1].role, 'phd')
  assert.equal(rows[1].section, 'current')
})

test('parseLegacyTeamPage splits current from past members', () => {
  const rows = parseLegacyTeamPage(TEAM_HTML)
  const past = rows.filter((r) => r.section === 'past')
  assert.equal(past.length, 1)
  assert.equal(past[0].name, 'R. Barbulescu')
  // The displayed name is abbreviated; the photo filename carries the full one.
  assert.equal(past[0].nameFromPhoto, 'Ruxandra Barbulescu')
  assert.equal(past[0].role, 'alumni')
  assert.equal(past[0].membershipStatus, 'completed')
})

test('parseLegacyTeamPage returns an empty list for markup it does not recognise', () => {
  assert.deepEqual(parseLegacyTeamPage('<div>nothing here</div>'), [])
})
