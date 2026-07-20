import type { Where } from 'payload'

// The frontend reads via the Local API, which bypasses access control by default,
// so every public query must filter to published content explicitly. Keep this in
// one place so no page forgets it and leaks drafts/imported items to the site.
export const PUBLISHED: Where = { status: { equals: 'published' } }

// Merge the published constraint with page-specific filters (year, type, …).
export function published(extra?: Where): Where {
  if (!extra || Object.keys(extra).length === 0) return PUBLISHED
  return { and: [PUBLISHED, extra] }
}
