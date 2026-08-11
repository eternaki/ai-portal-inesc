// Publications carry the academic form of a name ("Alexandre P. Francisco") while
// our member records carry the everyday one ("Alexandre Francisco"), so eight
// members are authors of papers we already hold without being linked to them.
//
// This is an explicit allowlist rather than a looser rule in the general matcher.
// A rule loose enough to catch these eight is loose enough to attribute someone
// else's paper: the author string "Gonçalo Oliveira" matches both our
// "Gonçalo Oliveira" and our "Gonçalo Goulart Oliveira", which is why the existing
// linker reports it ambiguous and refuses. Each pair below was checked by hand
// against the publication list; a misattributed paper is worse than a missing one.

import { normalizeName } from './member-importer.mjs'

export const AUTHOR_ALIASES = [
  { member: 'Alexandre Francisco', alias: 'Alexandre P. Francisco' },
  { member: 'Sara Madeira', alias: 'Sara C. Madeira' },
  { member: 'Alexandra Carvalho', alias: 'Alexandra M. Carvalho' },
  { member: 'Pedro Monteiro', alias: 'Pedro T. Monteiro' },
  { member: 'André Martins', alias: 'André L. Martins' },
  { member: 'Nuno Mendes', alias: 'Nuno D. Mendes' },
  { member: 'Pedro Stralen', alias: 'Pedro Van Stralen' },
  { member: 'Clara Pereira', alias: 'Clara Martins Pereira' },
]

/**
 * Attach `memberId` to every author row whose name is `alias` and which is not
 * already linked to somebody. Returns a new array plus how many rows changed, so
 * the caller can skip a write that would be a no-op.
 */
export function linkAliasInAuthors(authors, alias, memberId) {
  const target = normalizeName(alias)
  let changed = 0

  const next = (authors ?? []).map((author) => {
    if (author.member) return author
    if (normalizeName(author.name ?? '') !== target) return author
    changed += 1
    return { ...author, member: memberId }
  })

  return { authors: changed > 0 ? next : authors, changed }
}
