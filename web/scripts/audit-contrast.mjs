/**
 * Contrast audit for the public stylesheet, in both themes.
 *
 * Run:  pnpm design:contrast
 *
 * The site ships a light and a dark palette built from the same token names, so a
 * rule that reads well in one can fail in the other without anybody noticing —
 * that is exactly how the map tooltip ended up at 1.2:1 on dark. This resolves
 * every token, finds the foreground/background pairs the CSS actually puts
 * together, and reports the ones below the WCAG AA threshold for their text size.
 *
 * Pure reporting: it changes nothing and has no opinion about design, only about
 * whether text can be read.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const CSS = path.resolve(dirname, '../src/app/(frontend)/styles.css')

/** sRGB channel -> linear, per WCAG. */
const channel = (value) => {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

export function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

/** #rgb, #rrggbb, rgb()/rgba() -> [r,g,b,a]; anything else null. */
export function parseColor(value) {
  const text = (value ?? '').trim()
  let m = /^#([0-9a-f]{3})$/i.exec(text)
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1)
  m = /^#([0-9a-f]{6})$/i.exec(text)
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1)
  m = /^rgba?\(([^)]+)\)$/i.exec(text)
  if (m) {
    const parts = m[1].split(/[,/]/).map((p) => parseFloat(p))
    if (parts.length < 3 || parts.some(Number.isNaN)) return null
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
  }
  return null
}

/** Lay a possibly translucent colour over an opaque one. */
export function flatten(color, backdrop) {
  const [r, g, b, a] = color
  if (a >= 1) return [r, g, b]
  return [0, 1, 2].map((i) => Math.round(color[i] * a + backdrop[i] * (1 - a)))
}

/** `--name: value;` pairs from one rule body. */
function readTokens(css, selector) {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)
  const tokens = {}
  if (!block) return tokens
  for (const line of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[line[1]] = line[2].trim()
  }
  return tokens
}

/** Resolve `var(--a)` chains down to a literal colour. */
function resolve(value, tokens, seen = new Set()) {
  const text = (value ?? '').trim()
  const varMatch = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(text)
  if (!varMatch) return text
  if (seen.has(varMatch[1])) return null
  seen.add(varMatch[1])
  const next = tokens[varMatch[1]] ?? varMatch[2]
  return next ? resolve(next, tokens, seen) : null
}

/** Every rule as { selector, declarations }. Comments are stripped first. */
function readRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, ' ')
    if (!selector || selector.startsWith('@')) continue
    const declarations = {}
    for (const decl of match[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) {
      declarations[decl[1].trim()] = decl[2].trim()
    }
    rules.push({ selector, declarations })
  }
  return rules
}

const THRESHOLD = { normal: 4.5, large: 3 }

// A few blocks paint a fixed background of their own instead of using the theme
// tokens, so text inside them must be judged against that, not against the page.
// The hero keeps its dark gradient in both themes; its near-white text is correct
// there and would otherwise be reported as failing on the light theme.
const FIXED_SURFACES = {
  '.eyebrow': '#16233f',
  '.hero h1': '#16233f',
  '.stat b': '#16233f',
  '.stat > span': '#16233f',
}

/** Rules whose own font-size marks them as large text (>=24px, or >=18.66px bold). */
function isLargeText(declarations) {
  const size = declarations['font-size']
  if (!size) return false
  const rem = /^([\d.]+)rem$/.exec(size)
  const px = /^([\d.]+)px$/.exec(size)
  const value = rem ? parseFloat(rem[1]) * 16 : px ? parseFloat(px[1]) : null
  if (value === null) return false
  const weight = parseInt(declarations['font-weight'] ?? '400', 10)
  return value >= 24 || (value >= 18.66 && weight >= 700)
}

/**
 * The fill a descendant selector sits on, from the nearest ancestor rule that
 * declares one. Only walks whole-word ancestors of a descendant selector, so
 * `.a .b` looks at `.a` — it never guesses across unrelated rules.
 */
export function inheritedBackground(selector, rules) {
  const parts = selector.split(' ')
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const ancestor = parts.slice(0, i).join(' ')
    const rule = rules.find((r) => r.selector === ancestor)
    const bg = rule?.declarations.background ?? rule?.declarations['background-color']
    if (bg) return bg
  }
  return null
}

async function run() {
  const css = await readFile(CSS, 'utf8')
  const light = readTokens(css, ':root')
  const dark = { ...light, ...readTokens(css, ":root\\[data-theme='dark'\\]") }
  const rules = readRules(css)

  const findings = []

  for (const theme of [
    { name: 'light', tokens: light },
    { name: 'dark', tokens: dark },
  ]) {
    const page = parseColor(resolve('var(--paper)', theme.tokens)) ?? [255, 255, 255, 1]
    const pageRgb = [page[0], page[1], page[2]]

    for (const rule of rules) {
      const fgRaw = rule.declarations.color
      // A child sets colour and inherits its parent's fill — `.event-date-badge
      // span` is white text on a surface declared one rule up. Checking only
      // rules that carry both properties misses exactly those, which is how a
      // white-on-near-white badge label survived the first pass.
      const bgRaw =
        rule.declarations.background ??
        rule.declarations['background-color'] ??
        inheritedBackground(rule.selector, rules)
      if (!fgRaw || !bgRaw) continue

      const fg = parseColor(resolve(fgRaw, theme.tokens))
      const bg = parseColor(resolve(bgRaw, theme.tokens))
      if (!fg || !bg) continue

      const surface = FIXED_SURFACES[rule.selector]
      const backdrop = surface ? parseColor(surface).slice(0, 3) : pageRgb
      const bgFlat = flatten(bg, backdrop)
      const fgFlat = flatten(fg, bgFlat)
      const ratio = contrast(fgFlat, bgFlat)
      const need = isLargeText(rule.declarations) ? THRESHOLD.large : THRESHOLD.normal

      if (ratio < need) {
        findings.push({
          theme: theme.name,
          selector: rule.selector,
          color: fgRaw,
          background: bgRaw,
          ratio: Number(ratio.toFixed(2)),
          needs: need,
        })
      }
    }
  }

  findings.sort((a, b) => a.ratio - b.ratio)

  console.log(`rules with an explicit colour + background pair: checked in both themes`)
  if (findings.length === 0) {
    console.log('no contrast failures')
    return
  }
  console.log(`\n${findings.length} below threshold:\n`)
  for (const f of findings) {
    console.log(
      `  ${f.ratio.toFixed(2).padStart(5)} (needs ${f.needs})  [${f.theme}]  ${f.selector}\n` +
        `         color ${f.color}  on  ${f.background}`,
    )
  }
  process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('audit-contrast.mjs')) {
  await run()
}
