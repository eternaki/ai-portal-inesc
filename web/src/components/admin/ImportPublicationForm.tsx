'use client'

import React, { useState } from 'react'

// Admin form: paste a DOI / OpenAlex id / URL / title → preview the resolved
// publication + a duplicate warning → create it as a draft in the editorial
// review queue. Nothing is published directly (human-in-the-loop, per the plan).

type Preview = {
  title?: string
  year?: number
  venue?: string
  doi?: string
  openalexId?: string
  abstract?: string
  authors?: { name: string }[]
}

type Duplicate = { id: number; title?: string; status?: string; slug?: string }

async function callIngest(action: 'lookup' | 'create', identifier: string) {
  const res = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, identifier }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

// Collapsible panel shown above the Publications list (beforeListTable). Keeps
// the importer one click away without dominating the list view.
export function ImportPublicationPanel() {
  return (
    <details style={{ margin: '0 0 1.25rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '0.5rem 0' }}>
        + Import a publication by DOI / URL / title
      </summary>
      <div style={{ paddingTop: '0.75rem' }}>
        <ImportPublicationForm />
      </div>
    </details>
  )
}

export function ImportPublicationForm() {
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState<null | 'lookup' | 'create'>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [created, setCreated] = useState<{ id: number; status?: string; created: boolean } | null>(
    null,
  )

  const reset = () => {
    setPreview(null)
    setDuplicate(null)
    setNotFound(false)
    setCreated(null)
    setError(null)
  }

  const onLookup = async () => {
    reset()
    setLoading('lookup')
    try {
      const data = await callIngest('lookup', identifier)
      if (!data.found) setNotFound(true)
      else {
        setPreview(data.publication)
        setDuplicate(data.duplicate ?? null)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  const onCreate = async () => {
    setLoading('create')
    setError(null)
    try {
      const data = await callIngest('create', identifier)
      setCreated({ id: data.id, status: data.status, created: data.created })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  const box: React.CSSProperties = {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 6,
    padding: '1rem 1.25rem',
    marginTop: '1rem',
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ color: 'var(--theme-elevation-600)' }}>
        Paste a DOI, an OpenAlex work id, a publication URL, or a title. Preview it, then create it
        as a draft — it enters the review queue and is not published until approved.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && identifier.trim().length >= 3 && onLookup()}
          placeholder="10.1145/3292500.3330701  ·  W2741809807  ·  https://doi.org/…  ·  paper title"
          style={{
            flex: 1,
            padding: '0.6rem 0.75rem',
            borderRadius: 6,
            border: '1px solid var(--theme-elevation-150)',
            background: 'var(--theme-input-bg)',
            color: 'var(--theme-text)',
          }}
        />
        <button
          className="btn btn--style-primary"
          type="button"
          onClick={onLookup}
          disabled={identifier.trim().length < 3 || loading !== null}
        >
          {loading === 'lookup' ? 'Looking up…' : 'Preview'}
        </button>
      </div>

      {error && (
        <div style={{ ...box, borderColor: '#c0392b', color: '#c0392b' }}>{error}</div>
      )}

      {notFound && (
        <div style={box}>No publication found for that identifier. Try a different DOI or title.</div>
      )}

      {preview && !created && (
        <div style={box}>
          <h3 style={{ margin: '0 0 0.5rem' }}>{preview.title}</h3>
          <div style={{ color: 'var(--theme-elevation-600)', fontSize: 14 }}>
            {[preview.venue, preview.year].filter(Boolean).join(' · ')}
          </div>
          {preview.authors && preview.authors.length > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: 14 }}>
              {preview.authors.map((a) => a.name).join(', ')}
            </div>
          )}
          <div style={{ marginTop: '0.5rem', fontSize: 13, color: 'var(--theme-elevation-500)' }}>
            {preview.doi && <span>DOI: {preview.doi} · </span>}
            {preview.openalexId && <span>OpenAlex: {preview.openalexId}</span>}
          </div>
          {preview.abstract && (
            <p style={{ marginTop: '0.75rem', fontSize: 14, lineHeight: 1.5 }}>
              {preview.abstract.slice(0, 400)}
              {preview.abstract.length > 400 ? '…' : ''}
            </p>
          )}

          {duplicate && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.6rem 0.8rem',
                borderRadius: 6,
                background: 'var(--theme-warning-100, #fff4e5)',
                color: 'var(--theme-warning-800, #8a5a00)',
                fontSize: 14,
              }}
            >
              Already in the library (status: {duplicate.status ?? 'unknown'}).{' '}
              <a href={`/admin/collections/publications/${duplicate.id}`}>Open existing</a>. Creating
              will update its metadata, not duplicate it.
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <button
              className="btn btn--style-primary"
              type="button"
              onClick={onCreate}
              disabled={loading !== null}
            >
              {loading === 'create'
                ? 'Creating…'
                : duplicate
                  ? 'Update existing draft'
                  : 'Create draft (pending review)'}
            </button>
          </div>
        </div>
      )}

      {created && (
        <div style={{ ...box, borderColor: '#2e7d32' }}>
          <strong>{created.created ? 'Draft created' : 'Existing publication updated'}.</strong>{' '}
          Status: {created.status ?? 'pending_review'}.{' '}
          <a href={`/admin/collections/publications/${created.id}`}>Open in editor →</a>
          <div style={{ marginTop: '0.5rem' }}>
            <button
              className="btn btn--style-secondary"
              type="button"
              onClick={() => {
                setIdentifier('')
                reset()
              }}
            >
              Import another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
