import type { CollectionBeforeChangeHook } from 'payload'

// Whenever the editorial `status` changes, stamp who did it and append an entry
// to the append-only `reviewHistory` trail. Keeps the decision record honest
// without the reviewer having to fill anything in by hand — the plan asks for a
// decision history with a responsible reviewer.
export const recordEditorialDecision: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const prev = originalDoc?.status
  const next = data?.status

  // Only act on an actual status transition (create with a status counts too).
  if (!next || next === prev) return data

  const who = req?.user
  const reviewerLabel = who ? `${who.name ?? who.email ?? who.id}` : 'system'

  data.reviewer = who?.id ?? data.reviewer ?? null
  data.reviewHistory = [
    ...(originalDoc?.reviewHistory ?? []),
    {
      status: next,
      note: data.reviewNote ?? null,
      reviewer: reviewerLabel,
      // req time keeps all hooks in a request on one clock; falls back to now.
      at: (req as { requestedAt?: string })?.requestedAt ?? new Date().toISOString(),
    },
  ]

  return data
}
