// Which of the avatar colours a person gets when there is no photograph of them.
//
// Photo coverage is uneven for a reason no visitor can see — the only source of
// portraits is the group's old team page, so the students who arrived after it
// was last edited have none. The placeholder used to be one flat wash for
// everybody, and forty-two identical pale circles read as a page that failed to
// load rather than as a page about forty-two people. The list of names it was
// replaced with was honest but said even less.
//
// A stable colour per person fixes the actual problem: the circles stop looking
// like the same broken image repeated and start looking like distinct people.
// The name is the only input, so a person keeps their colour across pages,
// rebuilds and machines, with nothing to store.
//
// A fixed set of tones rather than a hue computed from the hash: eight pairs can
// be checked exhaustively against both themes — `pnpm design:contrast` reads them
// straight out of the stylesheet — and an arbitrary hue cannot. The colours
// themselves live in people.css, where the light and dark palettes already are.

export const AVATAR_TONES = 8

/**
 * A stable tone index in [0, AVATAR_TONES) for a person's name.
 *
 * FNV-1a over code points: tiny, dependency-free and well spread for short
 * strings, which matters here because a whole role group is shown at once and
 * two people side by side in the same colour would look like a rendering bug.
 * Iterating the string yields whole code points, so an accented or non-Latin
 * name cannot land on a different tone than it does elsewhere.
 */
export function avatarTone(name) {
  let hash = 0x811c9dc5
  for (const char of String(name ?? '')) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % AVATAR_TONES
}
