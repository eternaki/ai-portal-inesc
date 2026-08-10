import React from 'react'
import Link from 'next/link'
import { CLUSTER_COLORS } from '@/lib/clusterColors'

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'
const NOISE_COLOR = '#8a94a6'

type MapPoint = { x: number; y: number; cluster: number; publication: { id: number } }

async function fetchMap(): Promise<MapPoint[] | null> {
  try {
    const res = await fetch(`${AI_URL}/map`, { cache: 'no-store', signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data: { points: MapPoint[] } = await res.json()
    return data.points
  } catch {
    return null
  }
}

// A small "you are here" preview — the neighbourhood around this publication
// in embedding space, cropped from the full /map. Purely decorative/orienting;
// degrades to nothing if the AI service is down (see root CLAUDE.md §3).
export async function PublicationMiniMap({ publicationId, label }: { publicationId: number; label: string }) {
  const points = await fetchMap()
  if (!points || points.length < 4) return null

  const target = points.find((p) => p.publication.id === publicationId)
  if (!target) return null

  // The 24 nearest neighbours (in embedding space) plus the target itself.
  const neighbours = points
    .filter((p) => p !== target)
    .map((p) => ({ p, d: (p.x - target.x) ** 2 + (p.y - target.y) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 24)
    .map((n) => n.p)
  const shown = [...neighbours, target]

  const W = 320
  const H = 180
  const PAD = 22
  const xs = shown.map((p) => p.x)
  const ys = shown.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const sx = (x: number) => PAD + ((x - minX) / (maxX - minX || 1)) * (W - PAD * 2)
  const sy = (y: number) => PAD + ((y - minY) / (maxY - minY || 1)) * (H - PAD * 2)
  const color = (cluster: number) => (cluster === -1 ? NOISE_COLOR : CLUSTER_COLORS[cluster % CLUSTER_COLORS.length])

  return (
    <Link href={`/map?pub=${publicationId}`} className="mini-map">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {neighbours.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.2} fill={color(p.cluster)} opacity={0.55} />
        ))}
        <circle cx={sx(target.x)} cy={sy(target.y)} r={6} fill="none" stroke={color(target.cluster)} strokeWidth={2} />
        <circle cx={sx(target.x)} cy={sy(target.y)} r={3} fill={color(target.cluster)} />
      </svg>
      <span className="mini-map-label">{label}</span>
    </Link>
  )
}
