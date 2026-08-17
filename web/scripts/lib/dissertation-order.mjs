// /dissertations must lead with what a student can still apply to: open topics,
// then ongoing, then the finished archive. Nothing in the code says that in one
// place — the order is an emergent property of two files that have to agree:
//
//   1. `Dissertations.ts` declares the `status` options. Payload turns them into a
//      Postgres enum, and an enum sorts by *declaration* order, not alphabetically.
//   2. `dissertations/page.tsx` sorts `status` ascending, which is only the order
//      the page wants because of (1).
//
// Either file can be edited alone, plausibly, and silently break the page:
// flipping the sort to '-status' looks correct if you reason alphabetically
// (finished < ongoing < open), and alphabetising the options in the collection
// looks like tidying. Both put the archive in front of the open topics.
//
// So this module reads the order back out of both files and the test asserts it.
// The readers THROW when they match nothing rather than returning an empty array:
// the bug this guards against was originally shipped because it was checked
// against an empty dissertations table, where every ordering looks alike. A guard
// that can pass by finding nothing repeats that mistake in test form.

/** The order the page must list stages in. */
export const STAGE_ORDER = ['open', 'ongoing', 'finished']

class OrderSourceError extends Error {}

/**
 * The `status` values as declared in the Dissertations collection — i.e. the
 * order Postgres will sort the enum by.
 *
 * @param {string} source contents of `src/collections/Dissertations.ts`
 * @returns {string[]}
 */
export function declaredStageOrder(source) {
  const field = source.indexOf("name: 'status'")
  if (field === -1) {
    throw new OrderSourceError(
      "Dissertations.ts: no `name: 'status'` field. If the field was renamed, update STAGE_ORDER's readers — the page's sort depends on this field's option order.",
    )
  }

  const block = optionsBlockAt(source, field, 'Dissertations.ts')
  const values = [...block.matchAll(/value:\s*'([^']+)'/g)].map((m) => m[1])
  if (values.length === 0) {
    throw new OrderSourceError("Dissertations.ts: the `status` options block declares no values.")
  }
  return values
}

/**
 * The `sort` argument the dissertations list page passes to `payload.find`.
 *
 * @param {string} source contents of `src/app/(frontend)/dissertations/page.tsx`
 * @returns {string[]} e.g. `['status', '-createdAt']`
 */
export function listSortFields(source) {
  const start = source.indexOf('sort: [')
  if (start === -1) {
    throw new OrderSourceError(
      'dissertations/page.tsx: no `sort: [` argument found. The page must sort explicitly — Payload\'s default order is not the one this page needs.',
    )
  }

  const end = source.indexOf(']', start)
  const fields = [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (fields.length === 0) {
    throw new OrderSourceError('dissertations/page.tsx: the `sort` argument is empty.')
  }
  return fields
}

/** Slice out the `options: [ … ]` array that follows `from`, brackets balanced. */
function optionsBlockAt(source, from, file) {
  const start = source.indexOf('options: [', from)
  if (start === -1) {
    throw new OrderSourceError(`${file}: the \`status\` field declares no \`options\` array.`)
  }

  let depth = 0
  for (let i = source.indexOf('[', start); i < source.length; i += 1) {
    if (source[i] === '[') depth += 1
    else if (source[i] === ']') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new OrderSourceError(`${file}: the \`status\` options array is never closed.`)
}
