import React from 'react'
import Link from 'next/link'

// A filter that is also information. Thirty-five year chips wrapped to three rows
// and said nothing; the same width as a bar chart shows the group's output over
// time — the 2004-2011 run, the 2012-2016 dip, the recovery after 2021 — while
// staying exactly as clickable as the chips were.
//
// One series, so one hue and no legend. Selection is an outline ring plus a
// visible label, never a second colour: in dark mode two blues inside the
// permitted lightness band fail the colour-vision separation floor.
//
// Server-rendered SVG, no client JS: every bar is a link, so filtering works with
// JavaScript disabled exactly as the chips did.

const HEIGHT = 72
const CELL = 30
const BAR = 16
const RADIUS = 4

export type YearCount = { year: number; count: number }

export function YearHistogram({
  counts,
  activeYear,
  hrefForYear,
  labels,
}: {
  counts: YearCount[]
  activeYear?: string
  hrefForYear: (year: string | null) => string
  labels: {
    allYears: string
    aria: string
    table: string
    yearColumn: string
    countColumn: string
  }
}) {
  if (counts.length === 0) return null

  const byYear = new Map(counts.map((c) => [c.year, c.count]))
  const first = Math.min(...byYear.keys())
  const last = Math.max(...byYear.keys())
  // Every year in the span gets a cell, including those with no publications:
  // skipping them would compress the gaps and make the shape lie about the years
  // the group published nothing.
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const peak = Math.max(...byYear.values())

  const width = years.length * CELL

  return (
    <div className="year-histogram">
      <div className="year-histogram-head">
        <Link href={hrefForYear(null)} className={activeYear ? '' : 'active'}>
          {labels.allYears}
        </Link>
        {activeYear && (
          <span className="mono year-histogram-selected">
            {activeYear} · {byYear.get(Number(activeYear)) ?? 0}
          </span>
        )}
      </div>

      <svg
        className="year-histogram-svg"
        viewBox={`0 0 ${width} ${HEIGHT + 18}`}
        role="group"
        aria-label={labels.aria}
        preserveAspectRatio="none"
      >
        {years.map((year, index) => {
          const count = byYear.get(year) ?? 0
          const x = index * CELL
          const barHeight = count === 0 ? 0 : Math.max(3, Math.round((count / peak) * HEIGHT))
          const selected = String(year) === activeYear

          if (count === 0) {
            return (
              <rect
                key={year}
                x={x + (CELL - BAR) / 2}
                y={HEIGHT - 1}
                width={BAR}
                height={1}
                className="year-histogram-empty"
              />
            )
          }

          return (
            <Link key={year} href={hrefForYear(String(year))} aria-label={`${year}: ${count}`}>
              {/* The hit area spans the whole cell, not the bar: a one-publication
                  year is a 3px sliver nobody can click. */}
              <rect x={x} y={0} width={CELL} height={HEIGHT + 18} className="year-histogram-hit" />
              <rect
                x={x + (CELL - BAR) / 2}
                y={HEIGHT - barHeight}
                width={BAR}
                height={barHeight}
                rx={Math.min(RADIUS, barHeight)}
                className={`year-histogram-bar${selected ? ' is-selected' : ''}`}
              />
            </Link>
          )
        })}

        {/* Only the ends of the scale are labelled; a number under every bar is
            noise, and the selected year is already named above the chart. */}
        <text x={0} y={HEIGHT + 14} className="year-histogram-tick">
          {first}
        </text>
        <text x={width} y={HEIGHT + 14} textAnchor="end" className="year-histogram-tick">
          {last}
        </text>
      </svg>

      {/* A value must not be reachable by hover alone. */}
      <details className="year-histogram-details">
        <summary>{labels.table}</summary>
        <table className="year-histogram-table">
          <thead>
            <tr>
              <th>{labels.yearColumn}</th>
              <th>{labels.countColumn}</th>
            </tr>
          </thead>
          <tbody>
            {counts
              .slice()
              .sort((a, b) => b.year - a.year)
              .map((entry) => (
                <tr key={entry.year}>
                  <td>
                    <Link href={hrefForYear(String(entry.year))}>{entry.year}</Link>
                  </td>
                  <td className="mono">{entry.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
