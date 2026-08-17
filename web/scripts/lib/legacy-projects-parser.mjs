// Reader for the group's legacy projects page (mlkd.idss.inesc-id.pt/mlkd-projects.html).
// Pure: HTML in, plain objects out — no network, no filesystem, no Payload.
//
// The page lists the group's funded research projects under two headings, "Past
// Projects" and "Active Projects". Each entry is one anchor wrapping three lines:
// the acronym, the principal investigator, and a sentence of the shape
// "From 2017 to 2021, financed by P2020". That sentence is the only place the
// years and the funding body appear, so it is parsed rather than stored twice.

const FUNDER_KINDS = {
  // The funder tells us the project's kind, which the collection needs and the
  // page never states. EU programmes are international; FCT and the national
  // agencies are national. Anything unrecognised stays null so a human decides
  // rather than the importer guessing.
  fct: 'national',
  p2020: 'national',
  'agência nacional de inovação': 'national',
  'agencia nacional de inovacao': 'national',
  ani: 'national',
  eu: 'international',
  'horizon 2020': 'international',
  h2020: 'international',
  'horizon europe': 'international',
}

function decode(value) {
  return (value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * "From 2017 to 2021, financed by P2020" → {yearStart, yearEnd, funding}.
 *
 * Returns nulls for anything it can't read rather than a guess: a wrong grant or
 * year on a funded project is worse than a blank the editor fills in.
 */
export function parseProjectPeriod(value) {
  const text = decode(value)
  const years = /from\s+(\d{4})\s+to\s+(\d{4})/i.exec(text)
  const funder = /financed by\s+(.+?)\s*$/i.exec(text)
  const funding = funder ? funder[1].replace(/[.,;]+$/, '').trim() : null
  return {
    yearStart: years ? Number(years[1]) : null,
    yearEnd: years ? Number(years[2]) : null,
    funding: funding || null,
  }
}

/** Map a funding body to the collection's `kind`, or null when unrecognised. */
export function fundingToKind(funding) {
  if (!funding) return null
  const key = funding.toLowerCase().trim()
  if (FUNDER_KINDS[key]) return FUNDER_KINDS[key]
  for (const [name, kind] of Object.entries(FUNDER_KINDS)) {
    if (key.includes(name)) return kind
  }
  return null
}

/**
 * Parse the whole page into project records.
 *
 * Each record: {title, principalInvestigator, yearStart, yearEnd, funding, kind,
 * url, active}. `active` comes from which heading the entry sits under — the page
 * has no per-entry status, only the two sections.
 */
export function parseLegacyProjectsPage(html) {
  const source = String(html ?? '')

  // Where each section starts, so an entry's offset tells us which one it is in.
  const activeAt = source.search(/<h1>\s*Active Projects\s*<\/h1>/i)
  const pastAt = source.search(/<h1>\s*Past Projects\s*<\/h1>/i)

  // An entry belongs to whichever heading last appeared before it.
  const headings = [
    { at: pastAt, active: false },
    { at: activeAt, active: true },
  ].filter((h) => h.at >= 0)
  const sectionAt = (offset) => {
    const before = headings.filter((h) => h.at < offset).sort((a, b) => b.at - a.at)
    return before.length ? before[0].active : null
  }

  const projects = []
  // One anchor per project; the inner spans carry name / PI / period in order.
  const anchor = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = anchor.exec(source)) !== null) {
    const [, href, body] = match
    if (!/class="project-nav/i.test(body)) continue

    // Whitespace between the spans is inconsistent across entries — one project
    // (DeepPathCOVIDx) wraps its name onto its own line, and a regex that assumed
    // the tags were adjacent silently dropped it. Allow the gap everywhere.
    const name = /class="project-text">\s*<span>([\s\S]*?)<\/span>/i.exec(body)
    const pi = /class="project-text1">\s*<span>([\s\S]*?)<\/span>/i.exec(body)
    const period = /class="project-abstract">\s*<span>([\s\S]*?)<\/span>/i.exec(body)
    const title = decode(name?.[1])
    if (!title) continue

    const { yearStart, yearEnd, funding } = parseProjectPeriod(period?.[1])
    const active = sectionAt(match.index)

    projects.push({
      title,
      principalInvestigator: decode(pi?.[1]) || null,
      yearStart,
      yearEnd,
      funding,
      kind: fundingToKind(funding),
      url: href.startsWith('http') ? href : `https://mlkd.idss.inesc-id.pt/${href}`,
      active,
    })
  }
  return projects
}
