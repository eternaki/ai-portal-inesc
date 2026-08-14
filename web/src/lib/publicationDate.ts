// OpenAlex defaults `publication_date` to January 1st when it only knows the
// year, so a date landing exactly on Jan 1 carries no real day-level precision —
// showing it as a specific date would be showing a guess as a fact. `year` alone
// is the honest thing to render for those.
export function preciseDayMonth(publicationDate: string | null | undefined): Date | null {
  if (!publicationDate) return null
  const date = new Date(publicationDate)
  if (date.getUTCMonth() === 0 && date.getUTCDate() === 1) return null
  return date
}
