'use client'

import React, { useEffect, useMemo, useState } from 'react'

type CheckStatus = 'ready' | 'warning' | 'error' | 'not_configured' | 'unknown'

type HealthCheck = {
  id: string
  label: string
  status: CheckStatus
  detail: string
  hint?: string
  metrics?: Record<string, number | string | boolean | null>
}

type HealthReport = {
  status: CheckStatus
  generatedAt: string
  checks: HealthCheck[]
}

const statusLabel: Record<CheckStatus, string> = {
  ready: 'Ready',
  warning: 'Attention',
  error: 'Error',
  not_configured: 'Not configured',
  unknown: 'Unknown',
}

const statusColor: Record<CheckStatus, string> = {
  ready: '#2e7d32',
  warning: '#a15c00',
  error: '#b3261e',
  not_configured: '#6b5f00',
  unknown: '#59636e',
}

function formatMetricValue(value: number | string | boolean | null) {
  if (value === null) return 'n/a'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

export function HealthDashboard() {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/health/admin', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Health check failed (${res.status})`)
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])

  const summary = useMemo(() => {
    if (!report) return null
    const counts = report.checks.reduce<Record<CheckStatus, number>>(
      (acc, check) => {
        acc[check.status] += 1
        return acc
      },
      { ready: 0, warning: 0, error: 0, not_configured: 0, unknown: 0 },
    )
    return counts
  }, [report])

  return (
    <section
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>System health</h2>
        {report && (
          <span
            style={{
              color: statusColor[report.status],
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {statusLabel[report.status]}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          className="btn btn--style-secondary btn--size-small"
          type="button"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {summary && (
        <div style={{ marginTop: '0.5rem', color: 'var(--theme-elevation-600)', fontSize: 13 }}>
          {summary.ready} ready
          {summary.warning > 0 && ` · ${summary.warning} attention`}
          {summary.not_configured > 0 && ` · ${summary.not_configured} not configured`}
          {summary.unknown > 0 && ` · ${summary.unknown} unknown`}
          {summary.error > 0 && ` · ${summary.error} error`}
          {report && ` · checked ${new Date(report.generatedAt).toLocaleString()}`}
        </div>
      )}

      {error && <p style={{ color: '#b3261e' }}>{error}</p>}

      {report && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '0.75rem',
            marginTop: '1rem',
          }}
        >
          {report.checks.map((check) => (
            <article
              key={check.id}
              style={{
                border: '1px solid var(--theme-elevation-150)',
                borderLeft: `4px solid ${statusColor[check.status]}`,
                borderRadius: 6,
                padding: '0.75rem',
                background: 'var(--theme-elevation-0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{check.label}</h3>
                <span
                  style={{
                    color: statusColor[check.status],
                    fontSize: 12,
                    fontWeight: 700,
                    marginLeft: 'auto',
                  }}
                >
                  {statusLabel[check.status]}
                </span>
              </div>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--theme-elevation-700)' }}>
                {check.detail}
              </p>
              {check.hint && (
                <p style={{ margin: '0.5rem 0 0', color: 'var(--theme-elevation-600)', fontSize: 13 }}>
                  {check.hint}
                </p>
              )}
              {check.metrics && Object.keys(check.metrics).length > 0 && (
                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '0.25rem 0.75rem',
                    margin: '0.75rem 0 0',
                    fontSize: 13,
                  }}
                >
                  {Object.entries(check.metrics).map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt style={{ color: 'var(--theme-elevation-500)' }}>{key}</dt>
                      <dd style={{ margin: 0 }}>{formatMetricValue(value)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
