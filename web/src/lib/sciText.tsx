import React from 'react'

// OpenAlex returns bibliographic text with a little inline markup, and it carries
// meaning: species names are italicised by convention, and formulae rely on sub-
// and superscript. Stripping it prints "<i>n</i>-Order" at the reader; passing it
// to dangerouslySetInnerHTML would hand an external feed a script tag.
//
// So the markup is parsed here against a fixed allowlist and turned into real
// elements. Anything not on the list stays literal text — an unknown tag is shown,
// never executed. This is the "treat external text as untrusted" rule from the
// AI service applied on the way out instead of on the way in.

const TAGS: Record<string, keyof React.JSX.IntrinsicElements> = {
  i: 'i',
  em: 'em',
  b: 'strong',
  strong: 'strong',
  sub: 'sub',
  sup: 'sup',
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

function decode(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

const TOKEN = /<(\/?)(i|em|b|strong|sub|sup)\s*>/gi

/** Plain text with the allowed tags removed — for `<title>` and other attributes. */
export function sciTextToPlain(text: string): string {
  return decode(text.replace(TOKEN, ''))
}

/** Bibliographic text with its inline markup rendered as elements. */
export function renderSciText(text: string): React.ReactNode {
  if (!text) return null
  if (!TOKEN.test(text)) {
    TOKEN.lastIndex = 0
    return decode(text)
  }
  TOKEN.lastIndex = 0

  const out: React.ReactNode[] = []
  // One open tag at a time is enough for this data — nesting does not occur in
  // titles or abstracts, and a stack would invite silently reordering someone's
  // text when the feed is malformed.
  let open: keyof React.JSX.IntrinsicElements | null = null
  let buffer = ''
  let last = 0
  let key = 0

  const flush = () => {
    if (!buffer) return
    const content = decode(buffer)
    out.push(open ? React.createElement(open, { key: key++ }, content) : content)
    buffer = ''
  }

  for (const match of text.matchAll(TOKEN)) {
    buffer += text.slice(last, match.index)
    last = match.index + match[0].length

    const closing = match[1] === '/'
    const tag = TAGS[match[2].toLowerCase()]

    if (!closing && !open) {
      flush()
      open = tag
    } else if (closing && open === tag) {
      flush()
      open = null
    } else {
      // A stray or mismatched tag: keep it as the literal text it is.
      buffer += match[0]
    }
  }

  buffer += text.slice(last)
  flush()

  return out
}
