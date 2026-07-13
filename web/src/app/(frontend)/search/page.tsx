import React from 'react'
import Link from 'next/link'

// Поиск ходит в AI-сервис на каждый запрос
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Search' }

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

type SearchParams = Promise<{ q?: string }>

type SearchHit = {
  score: number
  publication: {
    id: number
    title: string
    slug?: string | null
    year?: number | null
    venue?: string | null
  }
}

async function runSearch(q: string): Promise<{ hits: SearchHit[]; error: string | null }> {
  try {
    const res = await fetch(`${AI_URL}/search?q=${encodeURIComponent(q)}&limit=20`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { hits: [], error: `search service returned ${res.status}` }
    const data = await res.json()
    return { hits: data.results ?? [], error: null }
  } catch {
    // Сайт не должен падать, если AI-сервис недоступен
    return { hits: [], error: 'search service is unavailable' }
  }
}

const EXAMPLES = [
  'detecting anomalies in medical images',
  'how do transformers handle long documents',
  'privacy-preserving machine learning',
]

export default async function SearchPage(props: { searchParams: SearchParams }) {
  const { q } = await props.searchParams
  const query = (q ?? '').trim()
  const { hits, error } = query ? await runSearch(query) : { hits: [], error: null }

  return (
    <div>
      <h1>Semantic search</h1>
      <p className="pub-meta">
        Describe a topic in your own words — results are ranked by meaning, not keywords.
      </p>

      <form method="get" className="search-form">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="e.g. deep learning for medical imaging"
          aria-label="Search query"
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      {!query && (
        <div className="filters">
          {EXAMPLES.map((ex) => (
            <Link key={ex} href={`/search?q=${encodeURIComponent(ex)}`}>
              {ex}
            </Link>
          ))}
        </div>
      )}

      {query && error && (
        <div className="empty">Search is temporarily unavailable ({error}). Please try again shortly.</div>
      )}

      {query && !error && hits.length === 0 && (
        <div className="empty">No matches for “{query}”. Try rephrasing the topic.</div>
      )}

      {hits.map((hit) => (
        <article key={hit.publication.id} className="pub-item">
          <div className="pub-title">
            {hit.publication.slug ? (
              <Link href={`/publications/${hit.publication.slug}`}>{hit.publication.title}</Link>
            ) : (
              hit.publication.title
            )}
          </div>
          <div className="pub-meta">
            <span className="mono">
              {hit.publication.year}
              {hit.publication.venue ? ` · ${hit.publication.venue}` : ''}
            </span>{' '}
            <span className="badge">match {(hit.score * 100).toFixed(0)}%</span>
          </div>
        </article>
      ))}
    </div>
  )
}
