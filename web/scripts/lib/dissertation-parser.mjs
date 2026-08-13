// Reader for the group's legacy dissertation pages (mlkd.idss.inesc-id.pt).
// Pure: HTML in, plain objects out — no network, no filesystem, no Payload — so
// every rule below is unit-testable without touching the live site.
//
// The source is builder-generated and uniform: each entry is one
// .thesis-topic-container1 holding a link (title + optional Fenix href), an
// attribution line, and an optional abstract. One finished entry uses
// .thesis-topic-no-abstract-* class names instead; both spellings are read here,
// because missing the variant would silently drop a record.

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

function decodeEntities(s) {
  return s
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function textOf(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function paragraphNode(text) {
  return {
    type: 'paragraph',
    children: [{ type: 'text', text }],
  }
}

/**
 * Convert an abstract's inner HTML to a Payload Lexical value.
 *
 * Only paragraphs are emitted. List items become numbered or bulleted
 * paragraphs rather than Lexical list nodes: the list node shape is an internal
 * Payload detail, and a wrong guess would break the admin editor for every
 * imported record. Text and reading order survive, which is what matters here.
 * Returns null for empty input so the caller can leave the field unset.
 */
export function htmlToLexical(html) {
  if (!html || !html.trim()) return null

  const children = []

  // Walk the source in order so a list stays where its introduction left it.
  // Node shapes below are the ones Payload's own converters read (`list` with
  // tag/listType, `listitem` with value, `heading` with tag) — taken from the
  // renderer's source rather than guessed, because a wrong shape renders nothing.
  const BLOCK = /<(ol|ul)\b[^>]*>([\s\S]*?)<\/\1>|<\/?p\b[^>]*>|<br\s*\/?>/gi
  let cursor = 0

  const pushProse = (chunk) => {
    const text = textOf(chunk)
    if (!text) return
    // A line that introduces what follows ("Techniques to explore:", "Notes:")
    // is a heading in the source's intent even though it arrives as prose. Short
    // and ending in a colon is the shape that distinguishes it from a sentence.
    if (text.endsWith(':') && text.length <= 80) {
      children.push({ type: 'heading', tag: 'h4', children: [{ type: 'text', text: text.slice(0, -1) }] })
    } else {
      children.push(paragraphNode(text))
    }
  }

  for (const match of html.matchAll(BLOCK)) {
    pushProse(html.slice(cursor, match.index))
    cursor = match.index + match[0].length

    if (!match[1]) continue // a <p> or <br> boundary: nothing to emit itself

    const ordered = match[1].toLowerCase() === 'ol'
    const items = []
    let value = 0
    for (const item of match[2].match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) ?? []) {
      const text = textOf(item)
      if (!text) continue
      value += 1
      items.push({ type: 'listitem', value, children: [{ type: 'text', text }] })
    }
    if (items.length > 0) {
      children.push({
        type: 'list',
        tag: ordered ? 'ol' : 'ul',
        listType: ordered ? 'number' : 'bullet',
        start: 1,
        children: items,
      })
    }
  }

  pushProse(html.slice(cursor))

  if (children.length === 0) return null
  return { root: { type: 'root', children } }
}

/**
 * Read "Supervised by A [and B] [and] authored by X".
 *
 * Split on the author marker first: supervisors are joined by " and ", so
 * splitting on " and " up front would swallow the author into the list. Returns
 * empty values on anything unrecognised — inventing a supervisor is worse than
 * importing a record without one, and Task 4's report surfaces the blanks.
 */
export function parseAttribution(text) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  const match = clean.match(/^Supervised by\s+(.*?)(?:\s+and)?\s+authored by\s+(.+)$/i)
  const supervisorPart = match ? match[1] : clean.replace(/^Supervised by\s+/i, '')
  const author = match ? match[2].trim() : null

  if (!/^Supervised by/i.test(clean)) return { supervisors: [], author: null }

  const supervisors = supervisorPart
    .split(/\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)

  return { supervisors, author }
}

// "Requisites:" opens the block that tells a student whether they can apply. It
// is present in every open topic, so it earns its own field; "Notes" and
// "External cooperation" appear in about half and stay inside the description.
const REQUISITES_RE = /^requisites\s*:?\s*/i

function splitRequisites(lexical) {
  if (!lexical) return { description: null, requisites: null }

  const description = []
  const requisites = []
  let inRequisites = false

  for (const node of lexical.root.children) {
    const text = node.children[0]?.text ?? ''
    if (REQUISITES_RE.test(text)) {
      inRequisites = true
      const stripped = text.replace(REQUISITES_RE, '').trim()
      if (stripped) requisites.push(paragraphNode(stripped))
      continue
    }
    ;(inRequisites ? requisites : description).push(node)
  }

  return {
    description: description.length ? { root: { type: 'root', children: description } } : null,
    requisites: requisites.length ? { root: { type: 'root', children: requisites } } : null,
  }
}

const ENTRY_RE =
  /<a\b([^>]*class="thesis-topic(?:-no-abstract)?-link"[^>]*)>\s*<span>([\s\S]*?)<\/span>\s*<\/a>\s*<span class="thesis-topic(?:-no-abstract)?-text">\s*<span>([\s\S]*?)<\/span>\s*<\/span>(?:\s*<span class="thesis-topic(?:-no-abstract)?-abstract">\s*<span>([\s\S]*?)<\/span>)?/gi

/**
 * Read every dissertation on one legacy page.
 * `status` is the stage that page represents; `sourceUrl` is recorded on each
 * record so a re-import can tell where a row came from.
 */
export function parseDissertationPage(html, { status, sourceUrl }) {
  const rows = []
  for (const m of html.matchAll(ENTRY_RE)) {
    const [, anchorAttrs, titleHtml, attributionHtml, abstractHtml] = m
    const title = textOf(titleHtml)
    if (!title) continue

    const hrefMatch = anchorAttrs.match(/href="([^"]+)"/i)
    const { supervisors, author } = parseAttribution(textOf(attributionHtml))
    const { description, requisites } = splitRequisites(htmlToLexical(abstractHtml ?? ''))

    rows.push({
      title,
      status,
      supervisors,
      author,
      description,
      requisites,
      fenixUrl: hrefMatch ? hrefMatch[1] : null,
      sourceUrl,
    })
  }
  return rows
}
