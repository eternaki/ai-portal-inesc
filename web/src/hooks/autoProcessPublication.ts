import type { CollectionAfterChangeHook } from 'payload'

// After a publication is saved in the admin — ask the AI service to generate the
// summary and embedding. Fire-and-forget: the site and admin must not depend on
// the AI service being available, so errors are only logged.
//
// Skipped when the request is tagged X-Skip-Autoprocess — every request from the
// AI service itself (ingest, writing summaries) is tagged that way so a bulk
// ingest does not cause a spike of LLM calls. The batch pipelines (summarize/embed)
// handle bulk loads separately.
export const autoProcessPublication: CollectionAfterChangeHook = async ({ doc, req }) => {
  const aiUrl = process.env.AI_SERVICE_URL
  const token = process.env.AI_SERVICE_TOKEN
  if (!aiUrl || !token) return doc

  if (req?.headers?.get('x-skip-autoprocess')) return doc

  // Only generate when there is something to summarize and no summary yet
  if (!doc?.abstract || doc?.aiSummaryStatus !== 'none') return doc

  // Fire-and-forget: do not block the save — the AI service processes in the
  // background and the summary appears a few seconds later. The site does not
  // depend on the AI service.
  void fetch(`${aiUrl}/process/publication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
    body: JSON.stringify({ id: doc.id }),
    signal: AbortSignal.timeout(120000),
  }).catch((err) => {
    req?.payload?.logger?.warn(`autoProcessPublication: AI service call failed: ${err}`)
  })

  return doc
}
