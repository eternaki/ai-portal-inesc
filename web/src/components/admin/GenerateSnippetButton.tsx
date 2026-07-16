'use client'

import React, { useState } from 'react'
import { Button, useDocumentInfo } from '@payloadcms/ui'

// Admin button: generate LinkedIn/X post text for the current document
// (publications | news). The result is saved to socialSnippet — reload the
// document after generating to see the field.
export const GenerateSnippetButton: React.FC = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  if (!id) return null // document not saved yet

  const generate = async () => {
    setState('busy')
    setMessage('')
    try {
      const res = await fetch('/api/ai/snippet', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: collectionSlug, id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setState('done')
      setMessage(data?.snippet || 'Snippet saved.')
    } catch (err) {
      setState('error')
      setMessage(err instanceof Error ? err.message : 'Failed to generate')
    }
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <Button onClick={generate} disabled={state === 'busy'} size="small" buttonStyle="secondary">
        {state === 'busy' ? 'Generating…' : 'Generate social snippet (AI)'}
      </Button>
      {state === 'done' && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
          <strong>Saved to “socialSnippet”</strong> — reload the document to see it. Preview:
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f3f3f3', padding: '0.6rem', borderRadius: 4 }}>
            {message}
          </pre>
        </div>
      )}
      {state === 'error' && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#b32d0f' }}>{message}</div>
      )}
    </div>
  )
}
