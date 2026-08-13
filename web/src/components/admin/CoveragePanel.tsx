'use client'

import React, { useEffect, useState } from 'react'

// Dashboard panel answering "what did the platform actually add?" — per member,
// publications on the site vs the baseline that was known before ingest, plus an
// optional OpenAlex comparison. Read-only, like the maintenance panel.

type MemberRow = {
  id: number
  name: string
  openalexId?: string | null
  on_site: number
  baseline: number | null
  discovered: number | null
  openalex_total: number | null
  missing_vs_openalex: number | null
}

type Report = {
  members_total: number
  members_with_baseline: number
  members_without_links: number
  openalex_checked: number
  openalex_truncated: boolean
  totals: {
    on_site: number
    on_site_with_baseline: number
    baseline: number
    discovered: number
    missing_vs_openalex: number
  }
  members: MemberRow[]
}

const num = (v: number | null) => (v === null || v === undefined ? '—' : String(v))
const signed = (v: number | null) => (v === null || v === undefined ? '—' : v > 0 ? `+${v}` : String(v))

export function CoveragePanel() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const load = async (openalex: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/coverage${openalex ? '?openalex=true' : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`)
      setReport(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load(false)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])

  // Only members with something to compare are worth showing by default.
  const rows = report ? [...report.members].sort((a, b) => b.on_site - a.on_site) : []
  const visible = expanded ? rows : rows.slice(0, 10)

  const tiles = report
    ? [
        { label: 'Publications on site', value: String(report.totals.on_site) },
        { label: 'Known before', value: String(report.totals.baseline) },
        { label: 'Discovered', value: signed(report.totals.discovered), highlight: true },
        { label: 'Members with baseline', value: `${report.members_with_baseline}/${report.members_total}` },
        { label: 'Members with no linked papers', value: String(report.members_without_links) },
      ]
    : []

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>Publication coverage</h3>
        {report && (
          <span style={{ color: 'var(--theme-elevation-600)', fontSize: 14 }}>
            {report.members_with_baseline === 0
              ? 'No baselines set yet — fill “Known publication count” on a member'
              : `${signed(report.totals.discovered)} vs what was known before`}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          className="btn btn--style-secondary btn--size-small"
          type="button"
          onClick={() => load(false)}
          disabled={loading}
        >
          {loading ? 'Checking…' : 'Refresh'}
        </button>
        <button
          className="btn btn--style-secondary btn--size-small"
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          title="Also ask OpenAlex how many works each author has (slower)"
        >
          + Compare with OpenAlex
        </button>
      </div>

      {error && <div style={{ color: '#c0392b', marginTop: '0.75rem' }}>{error}</div>}

      {report && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '0.5rem',
              marginTop: '1rem',
            }}
          >
            {tiles.map((tile) => (
              <div
                key={tile.label}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: 6,
                  border: '1px solid var(--theme-elevation-150)',
                  background: tile.highlight ? 'var(--theme-elevation-50)' : 'transparent',
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700 }}>{tile.value}</div>
                <div style={{ fontSize: 13, color: 'var(--theme-elevation-600)' }}>{tile.label}</div>
              </div>
            ))}
          </div>

          <table style={{ width: '100%', marginTop: '1rem', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--theme-elevation-600)', fontSize: 12 }}>
                <th style={{ padding: '0.35rem 0' }}>Member</th>
                <th>On site</th>
                <th>Known before</th>
                <th>Discovered</th>
                <th>OpenAlex</th>
                <th>Not yet imported</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--theme-elevation-100)' }}>
                  <td style={{ padding: '0.35rem 0' }}>
                    <a href={`/admin/collections/members/${m.id}`}>{m.name}</a>
                  </td>
                  <td>{m.on_site}</td>
                  <td>{num(m.baseline)}</td>
                  <td style={{ fontWeight: m.discovered ? 700 : 400 }}>{signed(m.discovered)}</td>
                  <td>{num(m.openalex_total)}</td>
                  <td>{num(m.missing_vs_openalex)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length > 10 && (
            <button
              type="button"
              className="btn btn--style-none btn--size-small"
              onClick={() => setExpanded(!expanded)}
              style={{ marginTop: '0.5rem', padding: 0, color: 'var(--theme-elevation-600)' }}
            >
              {expanded ? 'Show less' : `Show all ${rows.length} members`}
            </button>
          )}

          <div style={{ marginTop: '0.75rem', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            Baseline comes from “Known publication count” on each member — members without one show “—”.
            {report.openalex_checked > 0 && ` · ${report.openalex_checked} authors checked on OpenAlex`}
            {report.openalex_truncated && ' (sampled)'}
          </div>
        </>
      )}
    </div>
  )
}
