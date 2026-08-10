'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

type MapPoint = {
  x: number
  y: number
  cluster: number
  publication: { id: number; title: string; slug?: string | null; year?: number | null }
}
type MapCluster = { id: number; label: string | null; count: number }

const COLORS = [
  '#2553a5', '#b97a10', '#2a7f62', '#8c3fa8', '#c04b3d',
  '#1b7f9e', '#6b6f2a', '#a83f68', '#4a5fc4', '#7a5230',
]
const NOISE_COLOR = '#8a94a6'

const W = 960
const H = 620
const MAX_ZOOM = 8

export function TopicMapChart({
  points,
  clusters,
  clusterLabel,
  svgAria,
  highlightId,
}: {
  points: MapPoint[]
  clusters: MapCluster[]
  clusterLabel: string
  svgAria: string
  highlightId?: number
}) {
  const [hover, setHover] = useState<{ point: MapPoint; screenX: number; screenY: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H })
  const drag = useRef<{ startClientX: number; startClientY: number; startView: typeof view; moved: boolean } | null>(
    null,
  )
  // The drag itself is tracked in a ref (pointer math needs a synchronous value),
  // but the cursor is rendered output — refs must not be read during render, so
  // the grab/grabbing state gets its own piece of state.
  const [dragging, setDragging] = useState(false)

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = view.x + ((clientX - rect.left) / rect.width) * view.w
    const py = view.y + ((clientY - rect.top) / rect.height) * view.h
    setView((v) => {
      const nextW = Math.min(W, Math.max(W / MAX_ZOOM, v.w * factor))
      const nextH = nextW * (H / W)
      let nx = px - ((px - v.x) / v.w) * nextW
      let ny = py - ((py - v.y) / v.h) * nextH
      nx = Math.min(W - nextW, Math.max(0, nx))
      ny = Math.min(H - nextH, Math.max(0, ny))
      return { x: nx, y: ny, w: nextW, h: nextH }
    })
  }

  // Wheel zoom needs a non-passive listener to preventDefault (stop page scroll)
  // — React's onWheel is passive by default and can't do that reliably.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 1 / 1.15)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { startClientX: e.clientX, startClientY: e.clientY, startView: view, moved: false }
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const dxClient = e.clientX - drag.current.startClientX
    const dyClient = e.clientY - drag.current.startClientY
    if (Math.abs(dxClient) > 3 || Math.abs(dyClient) > 3) drag.current.moved = true
    const dx = (dxClient / rect.width) * drag.current.startView.w
    const dy = (dyClient / rect.height) * drag.current.startView.h
    const sv = drag.current.startView
    setView({
      x: Math.min(W - sv.w, Math.max(0, sv.x - dx)),
      y: Math.min(H - sv.h, Math.max(0, sv.y - dy)),
      w: sv.w,
      h: sv.h,
    })
  }
  const onPointerUp = () => {
    drag.current = null
    setDragging(false)
  }
  // Swallow the click that follows a drag so it doesn't navigate away.
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  // Map markers, not a photograph: keep dot/line size constant in *screen*
  // pixels as we zoom, so overlapping points actually pull apart (their SVG
  // coordinates don't move — the shrinking viewBox is what does the separating).
  const zoomScale = view.w / W
  const zoomed = view.w < W - 0.5
  const zoomIn = () => zoomAt(view.x + view.w / 2, view.y + view.h / 2, 1 / 1.5)
  const zoomOut = () => zoomAt(view.x + view.w / 2, view.y + view.h / 2, 1.5)
  const reset = () => setView({ x: 0, y: 0, w: W, h: H })

  const color = (cluster: number) => (cluster === -1 ? NOISE_COLOR : COLORS[cluster % COLORS.length])

  const { placed, edges } = useMemo(() => {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const PAD = 30
    const sx = (x: number) => PAD + ((x - minX) / (maxX - minX || 1)) * (W - PAD * 2)
    const sy = (y: number) => PAD + ((y - minY) / (maxY - minY || 1)) * (H - PAD * 2)
    const placed = points.map((p) => ({ p, cx: sx(p.x), cy: sy(p.y) }))

    // A light "citation graph" feel: connect each point to its nearest neighbour
    // in embedding space (cheap O(n²), fine at this scale). Prefers a same-cluster
    // neighbour when one exists, otherwise nearest overall — so the graph still
    // reads as a graph even when clustering found no dense groups (all noise).
    const edges: Array<{ a: { cx: number; cy: number; p: MapPoint }; b: { cx: number; cy: number; p: MapPoint } }> = []
    for (const a of placed) {
      let best: (typeof placed)[number] | null = null
      let bestDist = Infinity
      let bestSameCluster: (typeof placed)[number] | null = null
      let bestSameClusterDist = Infinity
      for (const b of placed) {
        if (b === a) continue
        const d = (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2
        if (d < bestDist) {
          bestDist = d
          best = b
        }
        if (a.p.cluster !== -1 && b.p.cluster === a.p.cluster && d < bestSameClusterDist) {
          bestSameClusterDist = d
          bestSameCluster = b
        }
      }
      const chosen = bestSameCluster ?? best
      if (chosen) edges.push({ a, b: chosen })
    }
    return { placed, edges }
  }, [points])

  const highlighted = highlightId != null ? placed.find((p) => p.p.publication.id === highlightId) : undefined

  // Arriving from a "view on map" link: zoom in and centre on that publication
  // instead of dropping the visitor into the whole, unfocused cloud of points.
  // Adjusted during render (React's "state derived from a prop change" pattern)
  // rather than in an effect: an effect would paint the wide, unfocused cloud
  // first and only then jump, and setState in an effect body cascades renders.
  // Tracking the id we last zoomed to keeps the visitor's own pan/zoom intact.
  const [zoomedToId, setZoomedToId] = useState<number | undefined>(undefined)
  if (highlighted && zoomedToId !== highlighted.p.publication.id) {
    const zoomW = W / 5
    const zoomH = zoomW * (H / W)
    setZoomedToId(highlighted.p.publication.id)
    setView({
      x: Math.min(W - zoomW, Math.max(0, highlighted.cx - zoomW / 2)),
      y: Math.min(H - zoomH, Math.max(0, highlighted.cy - zoomH / 2)),
      w: zoomW,
      h: zoomH,
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="img"
        aria-label={svgAria}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClickCapture={onClickCapture}
        style={{
          width: '100%',
          height: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--ink-12)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-sm)',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <defs>
          <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--ink-6)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x={-40} y={-40} width={W + 80} height={H + 80} fill="url(#map-grid)" />
        {edges.map(({ a, b }, i) => (
          <line
            key={i}
            x1={a.cx}
            y1={a.cy}
            x2={b.cx}
            y2={b.cy}
            stroke={color(a.p.cluster)}
            strokeOpacity="0.25"
            strokeWidth={zoomScale}
          />
        ))}
        {highlighted && (
          <circle
            className="map-dot-highlight-ring"
            cx={highlighted.cx}
            cy={highlighted.cy}
            r={14 * zoomScale}
            fill="none"
            stroke={color(highlighted.p.cluster)}
            strokeWidth={2 * zoomScale}
          />
        )}
        {placed.map(({ p, cx, cy }) => {
          const isHovered = hover?.point === p
          const isHighlighted = highlighted?.p === p
          const dot = (
            <circle
              className="map-dot"
              cx={cx}
              cy={cy}
              r={(isHovered || isHighlighted ? 8 : p.cluster === -1 ? 3.5 : 5) * zoomScale}
              fill={color(p.cluster)}
              stroke={isHovered || isHighlighted ? 'var(--ink)' : 'var(--card)'}
              strokeWidth={(isHovered || isHighlighted ? 2 : 1) * zoomScale}
            />
          )
          const handlers = {
            onMouseEnter: (e: React.MouseEvent) =>
              setHover({ point: p, screenX: e.clientX, screenY: e.clientY }),
            onMouseMove: (e: React.MouseEvent) =>
              setHover({ point: p, screenX: e.clientX, screenY: e.clientY }),
            onMouseLeave: () => setHover(null),
            onFocus: (e: React.FocusEvent) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setHover({ point: p, screenX: rect.left + rect.width / 2, screenY: rect.top })
            },
            onBlur: () => setHover(null),
          }
          return p.publication.slug ? (
            <Link
              key={p.publication.id}
              className="map-point"
              href={`/publications/${p.publication.slug}`}
              {...handlers}
            >
              {dot}
            </Link>
          ) : (
            <g key={p.publication.id} className="map-point" tabIndex={0} {...handlers}>
              {dot}
            </g>
          )
        })}
      </svg>

      <div className="map-zoom-controls">
        <button type="button" onClick={zoomIn} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={zoomOut} aria-label="Zoom out">
          −
        </button>
        {zoomed && (
          <button type="button" onClick={reset} aria-label="Reset zoom" className="map-zoom-reset">
            ⟲
          </button>
        )}
      </div>

      {hover && (
        <div className="map-tooltip" style={{ left: hover.screenX, top: hover.screenY }}>
          <strong>{hover.point.publication.title}</strong>
          <span>
            {hover.point.publication.year ? `${hover.point.publication.year} · ` : ''}
            {hover.point.cluster === -1
              ? clusterLabel
              : (clusters.find((c) => c.id === hover.point.cluster)?.label ?? `${clusterLabel} ${hover.point.cluster}`)}
          </span>
        </div>
      )}
    </div>
  )
}
