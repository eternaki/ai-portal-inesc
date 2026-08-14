// Reader for the group's legacy events page (mlkd.idss.inesc-id.pt/mlkd-events.html).
// Pure: HTML in, plain objects out — no network, no filesystem, no Payload.
//
// That page is the group's reading-group log: 83 meetings from March 2022 onward,
// each one a paper, the person who presented it and a link to the paper itself.
// Every entry is titled "Reading Group Meeting", which is why reading groups need
// no section of their own here — they are events, and this is the history of them.

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

/**
 * "Sep 9, 2025" or "March 15, 2022" → "2025-09-09".
 *
 * The page mixes abbreviated and full month names — 63 of the 83 entries use one
 * spelling, 20 the other — so both are accepted. Anything else returns null
 * rather than a guessed date: a wrong date on a seminar log is worse than a
 * missing one, and the caller reports the blanks.
 */
export function parseEventDate(value) {
  const match = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec((value ?? '').trim())
  if (!match) return null
  const month = MONTHS[match[1].toLowerCase()]
  if (!month) return null
  const day = Number(match[2])
  if (day < 1 || day > 31) return null
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

// One entry: a name, a date, then a linked paper title and the presenter. The
// whitespace between tags varies across the page, so every gap is `\s*`.
const ENTRY_RE = new RegExp(
  [
    '<h2 class="event-event-name">\\s*<span>\\s*([\\s\\S]*?)\\s*</span>',
    '[\\s\\S]{0,200}?',
    '<span class="event-event-date">\\s*<span>\\s*([\\s\\S]*?)\\s*</span>',
    '[\\s\\S]{0,400}?',
    '<a\\s+href="([^"]*)"[^>]*class="event-link"\\s*>\\s*<span>\\s*([\\s\\S]*?)\\s*</span>',
    '[\\s\\S]{0,300}?',
    '<span class="event-text2">\\s*<span>\\s*([\\s\\S]*?)\\s*</span>',
  ].join(''),
  'gi',
)

/** Every meeting on the legacy events page, newest first as the source lists them. */
export function parseLegacyEventsPage(html) {
  const rows = []
  for (const match of html.matchAll(ENTRY_RE)) {
    const [, kind, dateText, link, title, speaker] = match
    const cleanTitle = text(title)
    if (!cleanTitle) continue
    rows.push({
      title: cleanTitle,
      date: parseEventDate(text(dateText)),
      speaker: text(speaker) || null,
      link: link || null,
      kind: text(kind),
    })
  }
  return rows
}
