import React from 'react'

// Signature element: publications as points in embedding space, rendered as a
// slowly rotating knowledge graph. A deterministic PRNG (mulberry32) — the same
// "constellation" on every render, no Math.random (and no flicker on hydration).
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Dot = { x: number; y: number; r: number; kind: 'ink' | 'cobalt' | 'amber'; dx: number; dy: number; dur: number; delay: number }

// Builds a small nearest-neighbour graph (each point linked to its ~2 closest
// neighbours) so the group reads as a connected graph, not a loose scatter.
function buildEdges(dots: Dot[], perPoint: number): Array<[Dot, Dot]> {
  const edges: Array<[Dot, Dot]> = []
  const seen = new Set<string>()
  for (const a of dots) {
    const ranked = dots
      .filter((b) => b !== a)
      .map((b) => ({ b, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .sort((p, q) => p.d - q.d)
      .slice(0, perPoint)
    for (const { b } of ranked) {
      const key = a.x < b.x ? `${a.x},${a.y}-${b.x},${b.y}` : `${b.x},${b.y}-${a.x},${a.y}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([a, b])
    }
  }
  return edges
}

export function Scatter({
  width = 1080,
  height = 420,
  count = 90,
  seed = 20260713,
  className,
  dark = false,
}: {
  width?: number
  height?: number
  count?: number
  seed?: number
  className?: string
  dark?: boolean
}) {
  const rand = mulberry32(seed)
  const allDots: Dot[] = Array.from({ length: count }, () => {
    const x = rand() * width
    const y = rand() * height
    const roll = rand()
    return {
      x,
      y,
      r: 1.2 + rand() * 2.6,
      kind: roll > 0.93 ? 'amber' : roll > 0.72 ? 'cobalt' : 'ink',
      // A small independent wobble — matched in scale to the edge bend below —
      // so points feel like they're floating, not welded to a rigid frame.
      dx: (rand() - 0.5) * 10,
      dy: (rand() - 0.5) * 10,
      dur: 16 + rand() * 20,
      delay: -rand() * 24,
    }
  })

  // Two independent groups, rotating slowly in opposite directions around their
  // own centre — an "orbiting knowledge graph" feel instead of a static scatter.
  const groupA = allDots.filter((_, i) => i % 2 === 0)
  const groupB = allDots.filter((_, i) => i % 2 === 1)
  const edgesA = buildEdges(groupA, 1)
  const edgesB = buildEdges(groupB, 1)

  const fill = dark
    ? { ink: 'rgba(255,255,255,0.22)', cobalt: 'rgba(120,160,240,0.85)', amber: 'rgba(230,170,70,0.9)' }
    : { ink: 'rgba(27,42,65,0.18)', cobalt: 'rgba(37,83,165,0.55)', amber: 'rgba(185,122,16,0.6)' }
  const edgeStroke = dark ? 'rgba(255,255,255,0.16)' : 'rgba(27,42,65,0.12)'
  const maskId = dark ? 'scatter-mask-dark' : 'scatter-mask'
  const cx = width / 2
  const cy = height / 2

  // A straight connector reads as a rigid rod. Bowing it out and back via a
  // quadratic control point — animated with SMIL, which interpolates `d`
  // between path strings natively — makes each edge flex like a tendon instead
  // of a stiff bar, on top of the whole group's slow rotation.
  const edgePath = (a: Dot, b: Dot, bend: number) => {
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const px = -dy / len
    const py = dx / len
    const cx2 = mx + px * bend
    const cy2 = my + py * bend
    return `M ${a.x} ${a.y} Q ${cx2} ${cy2} ${b.x} ${b.y}`
  }

  const renderGroup = (dots: Dot[], edges: Array<[Dot, Dot]>, cls: string) => (
    <g className={cls} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      {edges.map(([a, b], i) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        const amp = Math.min(len * 0.22, 9)
        const p0 = edgePath(a, b, 0)
        const p1 = edgePath(a, b, i % 2 === 0 ? amp : -amp)
        const dur = 18 + ((i * 13) % 22)
        return (
          <path
            key={`e${i}`}
            className="scatter-edge"
            d={p0}
            fill="none"
            stroke={edgeStroke}
            strokeWidth="1"
            style={
              {
                animationDuration: `${5 + ((i * 13) % 8)}s`,
                animationDelay: `${-((i * 19) % 9)}s`,
              } as React.CSSProperties
            }
          >
            <animate
              attributeName="d"
              values={`${p0};${p1};${p0}`}
              dur={`${dur}s`}
              begin={`${-((i * 11) % dur)}s`}
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.37 0 0.63 1;0.37 0 0.63 1"
            />
          </path>
        )
      })}
      {dots.map((d, i) => (
        <circle
          key={i}
          className={`scatter-dot${d.kind !== 'ink' ? ' scatter-dot-accent' : ''}`}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill={fill[d.kind]}
          style={
            {
              '--dx': `${d.dx}px`,
              '--dy': `${d.dy}px`,
              animationDuration: d.kind !== 'ink' ? `${d.dur}s, 4.5s` : `${d.dur}s`,
              animationDelay: d.kind !== 'ink' ? `${d.delay}s, ${-((i * 37) % 11)}s` : `${d.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </g>
  )

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`scatter-fade-${maskId}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.45" stopColor="white" stopOpacity="0.25" />
          <stop offset="1" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id={maskId}>
          <rect width={width} height={height} fill={`url(#scatter-fade-${maskId})`} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        {renderGroup(groupA, edgesA, 'scatter-orbit scatter-orbit-cw')}
        {renderGroup(groupB, edgesB, 'scatter-orbit scatter-orbit-ccw')}
      </g>
    </svg>
  )
}
