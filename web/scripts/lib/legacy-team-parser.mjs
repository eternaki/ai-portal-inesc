// Reader for the group's legacy team page (mlkd.idss.inesc-id.pt/mlkd-team.html).
// Pure: HTML in, plain objects out — no network, no filesystem, no Payload.
//
// The page is builder-generated: each person is one .member-testimonial holding a
// photo, a name and a role label, and the roster is cut in two by a "Past members"
// heading. Two quirks drive the code below — the role label is spelled in several
// casings, and displayed names are sometimes abbreviated while the photo filename
// carries the full name.

// Legacy label (lowercased) → our role + membership status. Anything not listed
// returns null: mapping an unknown label to a guess would silently rewrite
// someone's standing in the group.
const ROLE_MAP = {
  'group leader': { role: 'faculty', membershipStatus: 'active' },
  'phd student': { role: 'phd', membershipStatus: 'active' },
  student: { role: 'msc', membershipStatus: 'active' },
  alumni: { role: 'alumni', membershipStatus: 'completed' },
}

export function normalizeLegacyRole(label) {
  const key = (label ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const mapped = ROLE_MAP[key]
  return mapped ? { ...mapped } : null
}

/**
 * Recover a full name from a photo filename such as `RuxandraBarbulescu.jpg`.
 *
 * Worth doing because the page abbreviates some names ("R. Barbulescu",
 * "Oleksander S.") while the file keeps them whole, and those are exactly the
 * entries that fail to match a member record. Returns null when the filename is
 * not a CamelCase person name, so the caller can fall back to the displayed name.
 */
export function nameFromPhotoFilename(path) {
  if (!path) return null
  const base = String(path).split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? ''
  if (!/^[A-Z][a-zA-Z]*[A-Z][a-zA-Z]*$/.test(base)) return null
  const words = base.match(/[A-Z][a-z]+/g)
  if (!words || words.length < 2) return null
  return words.join(' ')
}

const ENTRY_RE =
  /<img[^>]*src="([^"]+)"[^>]*class="member-image"[^>]*\/?>\s*<span class="member-name">\s*<span>([\s\S]*?)<\/span>\s*<\/span>\s*<span class="member-title">\s*<span>([\s\S]*?)<\/span>/gi

const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Every person on the legacy team page, tagged `current` or `past`.
 * The section comes from the "Past members" heading that splits the document.
 */
export function parseLegacyTeamPage(html) {
  const pastAt = html.search(/Past members/i)
  const rows = []

  for (const match of html.matchAll(ENTRY_RE)) {
    const [, photoPath, nameHtml, titleHtml] = match
    const name = text(nameHtml)
    if (!name) continue
    const title = text(titleHtml)
    const mapped = normalizeLegacyRole(title)

    rows.push({
      name,
      nameFromPhoto: nameFromPhotoFilename(photoPath),
      title,
      role: mapped?.role ?? null,
      membershipStatus: mapped?.membershipStatus ?? null,
      section: pastAt !== -1 && match.index > pastAt ? 'past' : 'current',
      photoPath,
    })
  }

  return rows
}
