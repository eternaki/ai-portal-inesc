// Four people on the legacy team page carry a name no matching rule can resolve,
// so each is pinned by hand to a member — keyed on the photo filename, which is
// the one part of a card that is unique.
//
// An explicit allowlist rather than a looser rule, for the same reason as
// `author-aliases.mjs`: a rule tolerant enough to catch these three is tolerant
// enough to put the wrong face on a profile.
//
//   VincenteSilvestre.png  their page misspells "Vicente" as "Vincente"
//   OleksanderS.jpeg       the surname is abbreviated to an initial, and the given
//                          name is spelled "Oleksander" there, "Oleksandr" here
//   gravo.jpeg             two different people are both displayed as "Gonçalo
//                          Oliveira"; the other card, GoncaloOliveira.jpg, already
//                          belongs to the member of that exact name, so this one is
//                          Gonçalo Goulart Oliveira. Without the pin the card
//                          matched the first Gonçalo, who already had a photo, and
//                          was silently counted as "already had one" — leaving the
//                          second Gonçalo with no picture and no warning.
//   JoaoMeneses.jpg        their card says "João Meneses", and so does the seed;
//                          the roster reconciliation later renames him to "João
//                          Meneses Santos", after which the surname pass compares
//                          Meneses against Santos and finds nothing. The pin names
//                          him as he is *when photos are imported* — `data:setup`
//                          runs the photo import before the reconciliations, for
//                          exactly this reason: the legacy cards use short names,
//                          so matching them after the renames loses ten people.

export const PHOTO_ALIASES = [
  { file: 'VincenteSilvestre.png', member: 'Vicente Silvestre' },
  { file: 'OleksanderS.jpeg', member: 'Oleksandr Stopchak' },
  { file: 'gravo.jpeg', member: 'Gonçalo Goulart Oliveira' },
  { file: 'JoaoMeneses.jpg', member: 'João Meneses' },
]

const BY_FILE = new Map(PHOTO_ALIASES.map((row) => [row.file, row.member]))

/**
 * The member a legacy photo file is pinned to, or null when it is not pinned.
 * Takes the full path from the page (`public/playground_assets/gravo.jpeg`).
 */
export function aliasedMemberName(photoPath) {
  return BY_FILE.get((photoPath ?? '').split('/').pop() ?? '') ?? null
}
