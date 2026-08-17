import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fundingToKind,
  parseLegacyProjectsPage,
  parseProjectPeriod,
} from '../lib/legacy-projects-parser.mjs'

const entry = (name, pi, period, href, spacedName = false) => `
  <a href="${href}" class="mlkd-projects-link2">
    <nav class="project-nav">
      <div class="project-project-container">
        <div class="project-name-container">
          <span class="project-text">${spacedName ? `\n  <span>${name}</span>\n` : `<span>${name}</span>`}</span>
        </div>
        <div class="project-question-container"><span class="project-text1"><span>${pi}</span></span></div>
        <div class="project-abstract-container"><span class="project-abstract"><span>${period}</span></span></div>
      </div>
    </nav>
  </a>`

const PAGE = `
  <h1>Past Projects</h1>
  ${entry('PRECISE', 'Alexandre Francisco', 'From 2016 to 2019, financed by FCT', 'https://x/1')}
  <h1>Active Projects</h1>
  ${entry('OLISSIPO', 'Susana Vinga', 'From 2021 to 2023, financed by Horizon 2020', 'https://x/2')}
  ${entry('DeepPathCOVIDx', 'Arlindo Oliveira', 'From 2020 to 2021, financed by Agência Nacional de Inovação', 'https://x/3', true)}
`

test('parses the period sentence into years and funder', () => {
  assert.deepEqual(parseProjectPeriod('From 2017 to 2021, financed by P2020'), {
    yearStart: 2017,
    yearEnd: 2021,
    funding: 'P2020',
  })
})

test('leaves unreadable periods blank rather than guessing', () => {
  assert.deepEqual(parseProjectPeriod('ongoing'), {
    yearStart: null,
    yearEnd: null,
    funding: null,
  })
})

test('maps funders to a project kind, null when unrecognised', () => {
  assert.equal(fundingToKind('FCT'), 'national')
  assert.equal(fundingToKind('Horizon 2020'), 'international')
  assert.equal(fundingToKind('Agência Nacional de Inovação'), 'national')
  assert.equal(fundingToKind('Some New Foundation'), null)
  assert.equal(fundingToKind(null), null)
})

test('reads every entry, including one whose name span is on its own line', () => {
  // This spacing variant is real: it silently cost us a project until the regex
  // stopped assuming the tags were adjacent.
  const projects = parseLegacyProjectsPage(PAGE)
  assert.equal(projects.length, 3)
  assert.ok(projects.some((p) => p.title === 'DeepPathCOVIDx'))
})

test('assigns active/past from the heading each entry sits under', () => {
  const projects = parseLegacyProjectsPage(PAGE)
  const byTitle = Object.fromEntries(projects.map((p) => [p.title, p]))
  assert.equal(byTitle.PRECISE.active, false)
  assert.equal(byTitle.OLISSIPO.active, true)
  assert.equal(byTitle.DeepPathCOVIDx.active, true)
})

test('carries the principal investigator and link through', () => {
  const [precise] = parseLegacyProjectsPage(PAGE)
  assert.equal(precise.principalInvestigator, 'Alexandre Francisco')
  assert.equal(precise.url, 'https://x/1')
  assert.equal(precise.yearStart, 2016)
  assert.equal(precise.kind, 'national')
})
