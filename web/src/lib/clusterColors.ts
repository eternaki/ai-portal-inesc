// Shared with /map and TopicMapChart — one palette so a publication's colour
// tag means the same thing everywhere on the site.
export const CLUSTER_COLORS = [
  '#2553a5', '#b97a10', '#2a7f62', '#8c3fa8', '#c04b3d',
  '#1b7f9e', '#6b6f2a', '#a83f68', '#4a5fc4', '#7a5230',
]

export const NOISE_COLOR = '#8a94a6'

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

// -1 (no stable cluster) still gets a colour — grey, matching /map — so every
// publication that HAS embeddings shows a dot; only publications missing from
// the topic map entirely (embeddings not computed yet) show none.
export function clusterColor(cluster: number): string {
  return cluster === -1 ? NOISE_COLOR : CLUSTER_COLORS[cluster % CLUSTER_COLORS.length]
}

/** publication id -> topic cluster id (or -1 for noise). Empty map if the AI
 * service / topic map isn't available — callers should degrade gracefully. */
export async function fetchPublicationClusters(): Promise<Map<number, number>> {
  try {
    // Cached, and on a short leash. The colours are decoration: the home page and
    // the publications list render perfectly without them, so they must never be
    // what a reader waits on. The topic map only changes when the clustering
    // pipeline runs, which is a manual batch job, so five minutes is generous.
    //
    // This mattered: with the AI service failing, an 8s no-store timeout on every
    // request turned both pages into ten-second loads.
    const res = await fetch(`${AI_URL}/map`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return new Map()
    const data: { points: Array<{ cluster: number; publication: { id: number } }> } = await res.json()
    return new Map(data.points.map((p) => [p.publication.id, p.cluster]))
  } catch {
    return new Map()
  }
}
