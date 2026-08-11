// Resolve a person named on the group's legacy site to a member record.
// Pure: takes plain objects, returns plain objects — no network, no Payload — so
// every matching rule is unit-tested without a database.
//
// Shared by the roster reconciliation and the photo importer, because a matching
// rule that lives in two scripts drifts in two directions.

import { firstLastKey, normalizeName } from './member-importer.mjs'

/**
 * Index members for the three matching passes.
 * A first+last key claimed by two different members is dropped: it is evidence of
 * ambiguity, not of a match, and attaching the wrong photo or rewriting the wrong
 * person's status is worse than reporting no match at all.
 */
export function buildMemberIndex(members) {
  const byExact = new Map()
  const byFirstLast = new Map()
  const ambiguous = new Set()

  for (const member of members) {
    byExact.set(normalizeName(member.name), member)

    const key = firstLastKey(member.name)
    if (!key) continue
    if (byFirstLast.has(key) && byFirstLast.get(key).id !== member.id) ambiguous.add(key)
    byFirstLast.set(key, member)
  }

  return { byExact, byFirstLast, ambiguous }
}

/**
 * Match one legacy person, weakest pass last.
 *
 * `how` is part of the contract: callers surface "first + last name only" hits for
 * human review instead of acting on them, so the caller must be able to tell a
 * certain match from a plausible one.
 */
export function matchMember({ name, nameFromPhoto } = {}, index) {
  const candidates = [name, nameFromPhoto].filter(Boolean)

  for (const candidate of candidates) {
    const hit = index.byExact.get(normalizeName(candidate))
    if (hit) return { member: hit, how: candidate === name ? 'exact name' : 'photo filename' }
  }

  for (const candidate of candidates) {
    const key = firstLastKey(candidate)
    if (!key || index.ambiguous.has(key)) continue
    const hit = index.byFirstLast.get(key)
    if (hit) return { member: hit, how: 'first + last name only' }
  }

  return { member: null, how: null }
}
