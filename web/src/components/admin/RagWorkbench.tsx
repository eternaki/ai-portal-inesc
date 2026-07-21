'use client'

import React, { useState } from 'react'
import { Button } from '@payloadcms/ui'

type RagResponse = {
  status: 'answered' | 'insufficient_evidence'
  answer: null | {
    executiveSummary: string
    evidence: string[]
    groundedEvidence?: Array<{ claim: string; sourceIds: string[] }>
    limitations: string[]
    suggestedReadings: Array<{ title: string; url: string; year?: number | null }>
  }
  citations: Array<{ title: string; year?: number | null; type: string; url: string; doi?: string | null; openalexId?: string | null }>
  metadata: { model?: string | null; provider?: string | null; sourceCount: number; latencyMs: number; promptVersion: string }
  warnings: string[]
  modelComparisons?: Array<{ model: string; latencyMs: number; answer: NonNullable<RagResponse['answer']> }>
}

const comparisonModels = [
  'gemini/gemini-flash-lite-latest',
  'groq/llama-3.1-8b-instant',
]

export const RagWorkbench: React.FC = () => {
  const [question, setQuestion] = useState('')
  const [compareModels, setCompareModels] = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<RagResponse | null>(null)

  const ask = async () => {
    setState('busy')
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/rag', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          compareModels,
          comparisonModels: compareModels ? comparisonModels : [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setResult(data)
      setState('idle')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'RAG request failed')
    }
  }

  return (
    <section style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 6, padding: '1rem', marginBottom: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Admin RAG</h2>
      <p style={{ color: 'var(--theme-elevation-600)', maxWidth: 760 }}>
        Ask over CMS content. The assistant answers only when it finds enough evidence and returns citations for review.
      </p>
      <textarea
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        rows={3}
        placeholder="Example: What MLKD research themes appear across publications and projects?"
        style={{ width: '100%', marginBottom: '0.75rem' }}
      />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '0.75rem' }}>
        <input type="checkbox" checked={compareModels} onChange={(event) => setCompareModels(event.target.checked)} />
        Compare models on demand
      </label>
      <Button onClick={ask} disabled={state === 'busy' || !question.trim()} size="small">
        {state === 'busy' ? 'Asking...' : 'Ask RAG'}
      </Button>
      {state === 'error' && <p style={{ color: '#b32d0f' }}>{error}</p>}
      {result && <ResultView result={result} />}
    </section>
  )
}

const ResultView: React.FC<{ result: RagResponse }> = ({ result }) => (
  <div style={{ marginTop: '1rem' }}>
    <p>
      <strong>Status:</strong> {result.status} · <strong>Model:</strong> {result.metadata.model || 'n/a'} ·{' '}
      <strong>Sources:</strong> {result.metadata.sourceCount} · <strong>Latency:</strong> {result.metadata.latencyMs}ms
    </p>
    {result.answer ? (
      <>
        <h3>Executive summary</h3>
        <p>{result.answer.executiveSummary}</p>
        <h3>Evidence</h3>
        <ul>
          {(result.answer.groundedEvidence?.length
            ? result.answer.groundedEvidence.map((item) => `${item.claim} [${item.sourceIds.join(', ')}]`)
            : result.answer.evidence
          ).map((item) => <li key={item}>{item}</li>)}
        </ul>
        <h3>Limitations</h3>
        <ul>{result.answer.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      </>
    ) : (
      <p>Not enough evidence to answer from the selected CMS content.</p>
    )}
    {result.citations.length > 0 && (
      <>
        <h3>Citations</h3>
        <ul>
          {result.citations.map((citation) => (
            <li key={`${citation.type}-${citation.url}-${citation.title}`}>
              <a href={citation.url}>{citation.title}</a>
              {citation.year ? ` (${citation.year})` : ''}
              {citation.doi ? ` · DOI ${citation.doi}` : ''}
              {citation.openalexId ? ` · OpenAlex ${citation.openalexId}` : ''}
            </li>
          ))}
        </ul>
      </>
    )}
    {result.warnings.length > 0 && (
      <p style={{ color: '#8a5a00' }}>
        <strong>Warnings:</strong> {result.warnings.join(' ')}
      </p>
    )}
    {result.modelComparisons && result.modelComparisons.length > 0 && (
      <>
        <h3>Model comparison</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {result.modelComparisons.map((item) => (
            <div key={item.model} style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 6, padding: '0.75rem' }}>
              <strong>{item.model}</strong>
              <p>{item.answer.executiveSummary}</p>
              <small>{item.latencyMs}ms</small>
            </div>
          ))}
        </div>
      </>
    )}
  </div>
)
