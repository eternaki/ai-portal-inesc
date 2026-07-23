'use client'

import React, { useEffect, useState } from 'react'

// Dashboard panel showing the AI maintenance report: data-health counts with a
// drill-down. Read-only — it points admins at problems to fix by hand.

type Report = {
  published_total: number
  links_checked: number
  links_truncated: boolean
  summary: Record<string, number>
  checks: Record<string, { id: number; title?: string; url?: string; field?: string }[]>
}

const LABELS: Record<string, string> = {
  missing_embeddings: 'Missing embeddings',
  duplicates: 'Duplicates',
  invalid_dois: 'Invalid DOIs',
  incomplete_content: 'Incomplete content',
  failed_jobs: 'Failed jobs',
  broken_links: 'Broken links',
}

export function MaintenancePanel() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const load = async (links: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/maintenance${links ? '?links=true' : ''}`)
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

  const total = report ? Object.values(report.summary).reduce((a, b) => a + b, 0) : 0

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
        <h3 style={{ margin: 0 }}>Data health</h3>
        {report && (
          <span style={{ color: total === 0 ? '#2e7d32' : '#b26a00', fontSize: 14 }}>
            {total === 0 ? 'All clear' : `${total} item(s) need attention`}
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
          title="Also verify external links (slower)"
        >
          + Check links
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
            {Object.keys(LABELS).map((key) => {
              const count = report.summary[key] ?? 0
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOpen(open === key ? null : key)}
                  style={{
                    textAlign: 'left',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 6,
                    border: '1px solid var(--theme-elevation-150)',
                    background: count > 0 ? 'var(--theme-elevation-50)' : 'transparent',
                    cursor: count > 0 ? 'pointer' : 'default',
                    color: 'var(--theme-text)',
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{count}</div>
                  <div style={{ fontSize: 13, color: 'var(--theme-elevation-600)' }}>
                    {LABELS[key]}
                  </div>
                </button>
              )
            })}
          </div>

          <div style={{ marginTop: '0.75rem', fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            {report.published_total} published papers
            {report.links_checked > 0 && ` · ${report.links_checked} links checked`}
            {report.links_truncated && ' (sampled)'}
          </div>

          {open && report.checks[open]?.length > 0 && (
            <ul style={{ marginTop: '0.75rem', fontSize: 14, lineHeight: 1.6 }}>
              {report.checks[open].slice(0, 50).map((item, i) => (
                <li key={i}>
                  <a href={`/admin/collections/publications/${item.id}`}>
                    {item.title || `#${item.id}`}
                  </a>
                  {item.field && ` — ${item.field}`}
                  {item.url && `: ${item.url}`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
