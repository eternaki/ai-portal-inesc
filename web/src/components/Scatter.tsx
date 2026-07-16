import React from 'react'

// Signature element: publications as points in embedding space.
// A deterministic PRNG (mulberry32) — the same "constellation" on every render,
// no Math.random (and no flicker on hydration).
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

type Dot = { x: number; y: number; r: number; kind: 'ink' | 'cobalt' | 'amber' }

export function Scatter({
  width = 1080,
  height = 420,
  count = 90,
  seed = 20260713,
  className,
}: {
  width?: number
  height?: number
  count?: number
  seed?: number
  className?: string
}) {
  const rand = mulberry32(seed)
  const dots: Dot[] = Array.from({ length: count }, () => {
    const x = rand() * width
    const y = rand() * height
    const roll = rand()
    return {
      x,
      y,
      r: 1.2 + rand() * 2.6,
      kind: roll > 0.93 ? 'amber' : roll > 0.72 ? 'cobalt' : 'ink',
    }
  })

  // A few thin edges between neighbors — a hint of a citation graph
  const edges: Array<[Dot, Dot]> = []
  for (let i = 0; i < dots.length && edges.length < 14; i += 7) {
    const a = dots[i]
    let best: Dot | null = null
    let bestDist = Infinity
    for (const b of dots) {
      if (b === a) continue
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2
      if (d < bestDist) {
        bestDist = d
        best = b
      }
    }
    if (best) edges.push([a, best])
  }

  const fill = { ink: 'rgba(27,42,65,0.18)', cobalt: 'rgba(37,83,165,0.55)', amber: 'rgba(185,122,16,0.6)' }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="scatter-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.45" stopColor="white" stopOpacity="0.25" />
          <stop offset="1" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id="scatter-mask">
          <rect width={width} height={height} fill="url(#scatter-fade)" />
        </mask>
      </defs>
      <g mask="url(#scatter-mask)">
        {edges.map(([a, b], i) => (
          <line
            key={`e${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="rgba(27,42,65,0.10)"
            strokeWidth="1"
          />
        ))}
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={fill[d.kind]} />
        ))}
      </g>
    </svg>
  )
}
