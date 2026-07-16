import React from 'react'

// The topic map is built by the AI service (UMAP+HDBSCAN) — render on each request
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Research map' }

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

type MapPoint = {
  x: number
  y: number
  cluster: number
  publication: { id: number; title: string; slug?: string | null; year?: number | null }
}
type MapCluster = { id: number; label: string | null; count: number }

// Cluster palette — derived from cobalt/amber, distinguishable in print
const COLORS = [
  '#2553a5', '#b97a10', '#2a7f62', '#8c3fa8', '#c04b3d',
  '#1b7f9e', '#6b6f2a', '#a83f68', '#4a5fc4', '#7a5230',
]

async function fetchMap(): Promise<{ points: MapPoint[]; clusters: MapCluster[] } | null> {
  try {
    const res = await fetch(`${AI_URL}/map`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function MapPage() {
  const data = await fetchMap()

  if (!data || data.points.length === 0) {
    return (
      <div>
        <h1>Research map</h1>
        <div className="empty">
          The topic map has not been computed yet — run the clustering pipeline
          (<code>python -m app.pipelines.cluster</code>) after ingesting publications.
        </div>
      </div>
    )
  }

  const { points, clusters } = data
  const W = 960
  const H = 620
  const PAD = 30
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const sx = (x: number) => PAD + ((x - minX) / (maxX - minX || 1)) * (W - PAD * 2)
  const sy = (y: number) => PAD + ((y - minY) / (maxY - minY || 1)) * (H - PAD * 2)
  const color = (cluster: number) =>
    cluster === -1 ? 'rgba(27,42,65,0.18)' : COLORS[cluster % COLORS.length]

  return (
    <div>
      <h1>Research map</h1>
      <p className="pub-meta" style={{ maxWidth: '60ch' }}>
        Every dot is a publication, placed by the meaning of its text (UMAP projection of
        embeddings). Colours are topic clusters found automatically; grey dots don’t belong
        to a stable cluster. Hover a dot for the title, click to open.
      </p>

      <div className="filters">
        {clusters.map((c) => (
          <span key={c.id} className="badge" style={{ borderColor: color(c.id), color: color(c.id) }}>
            {c.label ?? `cluster ${c.id}`} ({c.count})
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Scatter map of publications grouped by topic"
        style={{ width: '100%', height: 'auto', background: 'var(--card)', border: '1px solid var(--ink-12)', borderRadius: 'var(--radius)' }}
      >
        {points.map((p) => {
          const dot = (
            <circle cx={sx(p.x)} cy={sy(p.y)} r={p.cluster === -1 ? 3 : 4.5} fill={color(p.cluster)}>
              <title>
                {p.publication.title}
                {p.publication.year ? ` (${p.publication.year})` : ''}
              </title>
            </circle>
          )
          return p.publication.slug ? (
            <a key={p.publication.id} href={`/publications/${p.publication.slug}`}>
              {dot}
            </a>
          ) : (
            <g key={p.publication.id}>{dot}</g>
          )
        })}
      </svg>
    </div>
  )
}
