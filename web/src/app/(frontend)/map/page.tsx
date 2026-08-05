import React from 'react'
import { getDictionary } from '@/i18n/server'
import { TopicMapChart } from '@/components/TopicMapChart'

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
const NOISE_COLOR = '#8a94a6'

async function fetchMap(): Promise<{ points: MapPoint[]; clusters: MapCluster[] } | null> {
  try {
    const res = await fetch(`${AI_URL}/map`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

type SearchParams = Promise<{ pub?: string }>

export default async function MapPage(props: { searchParams: SearchParams }) {
  const { pub } = await props.searchParams
  const data = await fetchMap()
  const t = await getDictionary()

  if (!data || data.points.length === 0) {
    return (
      <div>
        <h1>{t.map.title}</h1>
        <div className="empty">
          {t.map.emptyBefore}
          <code>python -m app.pipelines.cluster</code>
          {t.map.emptyAfter}
        </div>
      </div>
    )
  }

  const { points, clusters } = data
  const color = (cluster: number) => (cluster === -1 ? NOISE_COLOR : COLORS[cluster % COLORS.length])

  return (
    <div>
      <h1>{t.map.title}</h1>
      <p className="pub-meta" style={{ maxWidth: '60ch' }}>{t.map.meta}</p>

      <div className="map-legend">
        {clusters.map((c) => (
          <span key={c.id} className="map-legend-item">
            <span className="map-legend-swatch" style={{ background: color(c.id) }} />
            {c.label ?? `${t.map.cluster} ${c.id}`} <span className="mono">({c.count})</span>
          </span>
        ))}
      </div>

      <TopicMapChart
        key={pub ?? 'all'}
        points={points}
        clusters={clusters}
        clusterLabel={t.map.cluster}
        svgAria={t.map.svgAria}
        highlightId={pub ? Number(pub) : undefined}
      />
    </div>
  )
}
