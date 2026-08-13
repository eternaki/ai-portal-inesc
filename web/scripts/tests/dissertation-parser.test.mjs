import assert from 'node:assert/strict'
import test from 'node:test'

import {
  htmlToLexical,
  parseAttribution,
  parseDissertationPage,
} from '../lib/dissertation-parser.mjs'

test('parseAttribution reads a single supervisor and no author', () => {
  const r = parseAttribution('Supervised by Arlindo L. Oliveira')
  assert.deepEqual(r, { supervisors: ['Arlindo L. Oliveira'], author: null })
})

test('parseAttribution reads two supervisors and an author', () => {
  const r = parseAttribution('Supervised by Arlindo L. Oliveira and Bruno Martins and authored by João Marques Cardoso')
  assert.deepEqual(r, {
    supervisors: ['Arlindo L. Oliveira', 'Bruno Martins'],
    author: 'João Marques Cardoso',
  })
})

test('parseAttribution tolerates the "authored by" spelling without a leading and', () => {
  const r = parseAttribution('Supervised by Arlindo L. Oliveira and Fernando Silva authored by José Velez')
  assert.deepEqual(r, {
    supervisors: ['Arlindo L. Oliveira', 'Fernando Silva'],
    author: 'José Velez',
  })
})

test('parseAttribution returns empty on unrecognised text rather than guessing', () => {
  assert.deepEqual(parseAttribution('nonsense'), { supervisors: [], author: null })
})

test('htmlToLexical turns paragraphs into paragraph nodes', () => {
  const out = htmlToLexical('First para.<p>Second para.</p>')
  assert.equal(out.root.type, 'root')
  assert.equal(out.root.children.length, 2)
  assert.equal(out.root.children[0].children[0].text, 'First para.')
  assert.equal(out.root.children[1].children[0].text, 'Second para.')
})

test('htmlToLexical emits a real ordered list, not numbered paragraphs', () => {
  const out = htmlToLexical('<ol><li>Use CLIP.</li><li>Use LayoutLM.</li></ol>')
  assert.equal(out.root.children.length, 1)
  const list = out.root.children[0]
  assert.equal(list.type, 'list')
  assert.equal(list.tag, 'ol')
  assert.equal(list.listType, 'number')
  assert.equal(list.children.length, 2)
  assert.equal(list.children[0].type, 'listitem')
  assert.equal(list.children[0].value, 1)
  assert.equal(list.children[0].children[0].text, 'Use CLIP.')
  assert.equal(list.children[1].value, 2)
})

test('htmlToLexical emits a bullet list for <ul>', () => {
  const out = htmlToLexical('<ul><li>First</li><li>Second</li></ul>')
  const list = out.root.children[0]
  assert.equal(list.tag, 'ul')
  assert.equal(list.listType, 'bullet')
  assert.equal(list.children.length, 2)
})

test('htmlToLexical keeps a list where its introduction left it', () => {
  // The line before the list introduces it; hoisting the list above that line
  // was the bug this ordering guards against.
  const out = htmlToLexical('<p>Techniques to explore:</p><ol><li>CLIP</li></ol><p>After.</p>')
  assert.deepEqual(
    out.root.children.map((n) => n.type),
    ['heading', 'list', 'paragraph'],
  )
})

test('htmlToLexical turns a short colon-terminated line into a heading', () => {
  const out = htmlToLexical('<p>Requisites:</p><p>Knows PyTorch.</p>')
  assert.equal(out.root.children[0].type, 'heading')
  assert.equal(out.root.children[0].tag, 'h4')
  assert.equal(out.root.children[0].children[0].text, 'Requisites')
  assert.equal(out.root.children[1].type, 'paragraph')
})

test('htmlToLexical leaves a long sentence ending in a colon as prose', () => {
  const long = 'The candidate will work on the following topics, chosen together with the supervisor and revised each semester:'
  const out = htmlToLexical(`<p>${long}</p>`)
  assert.equal(out.root.children[0].type, 'paragraph')
})

test('htmlToLexical decodes entities and drops empty blocks', () => {
  const out = htmlToLexical('<p>A &amp; B</p><p>  </p>')
  assert.equal(out.root.children.length, 1)
  assert.equal(out.root.children[0].children[0].text, 'A & B')
})

test('htmlToLexical returns null for empty input', () => {
  assert.equal(htmlToLexical(''), null)
  assert.equal(htmlToLexical('   '), null)
})

const FINISHED_HTML = `
<div class="thesis-topic-container1">
  <a href="https://fenix.tecnico.ulisboa.pt/x/1" class="thesis-topic-link"><span> Stroke Segmentation </span></a>
  <span class="thesis-topic-text"><span> Supervised by Arlindo L. Oliveira and authored by João Teixeira </span></span>
  <span class="thesis-topic-abstract"><span> Stroke is a leading cause of death. </span></span>
</div>
<div class="thesis-topic-no-abstract-container1">
  <a href="https://fenix.tecnico.ulisboa.pt/x/2" class="thesis-topic-no-abstract-link"><span> Untitled Work </span></a>
  <span class="thesis-topic-no-abstract-text"><span> Supervised by Bruno Martins and authored by Ana Alves </span></span>
</div>`

test('parseDissertationPage reads both the normal and the no-abstract variant', () => {
  const rows = parseDissertationPage(FINISHED_HTML, {
    status: 'finished',
    sourceUrl: 'https://example.test/finished',
  })
  assert.equal(rows.length, 2)

  assert.equal(rows[0].title, 'Stroke Segmentation')
  assert.equal(rows[0].status, 'finished')
  assert.deepEqual(rows[0].supervisors, ['Arlindo L. Oliveira'])
  assert.equal(rows[0].author, 'João Teixeira')
  assert.equal(rows[0].fenixUrl, 'https://fenix.tecnico.ulisboa.pt/x/1')
  assert.equal(rows[0].description.root.children[0].children[0].text, 'Stroke is a leading cause of death.')
  assert.equal(rows[0].sourceUrl, 'https://example.test/finished')

  assert.equal(rows[1].title, 'Untitled Work')
  assert.equal(rows[1].author, 'Ana Alves')
  assert.equal(rows[1].description, null)
})

test('parseDissertationPage leaves fenixUrl null when the anchor has no href', () => {
  const html = `
    <div class="thesis-topic-container1">
      <a class="thesis-topic-link"><span> Open Topic </span></a>
      <span class="thesis-topic-text"><span> Supervised by Arlindo L. Oliveira </span></span>
      <span class="thesis-topic-abstract"><span> Some description. Requisites: knows PyTorch. </span></span>
    </div>`
  const rows = parseDissertationPage(html, { status: 'open', sourceUrl: 'https://example.test/new' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].fenixUrl, null)
  assert.equal(rows[0].author, null)
})

test('parseDissertationPage splits a Requisites sentence into its own field', () => {
  const html = `
    <div class="thesis-topic-container1">
      <a class="thesis-topic-link"><span> Open Topic </span></a>
      <span class="thesis-topic-text"><span> Supervised by Arlindo L. Oliveira </span></span>
      <span class="thesis-topic-abstract"><span> <p>Study embeddings.</p><p>Requisites: The student should know PyTorch.</p> </span></span>
    </div>`
  const rows = parseDissertationPage(html, { status: 'open', sourceUrl: 'https://example.test/new' })
  assert.equal(rows[0].description.root.children[0].children[0].text, 'Study embeddings.')
  assert.equal(rows[0].requisites.root.children[0].children[0].text, 'The student should know PyTorch.')
})
