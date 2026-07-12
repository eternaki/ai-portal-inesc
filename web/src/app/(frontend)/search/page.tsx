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

export default async function SearchPage(props: { searchParams: SearchParams }) {
  const { q } = await props.searchParams
  const query = (q ?? '').trim()
  const { hits, error } = query ? await runSearch(query) : { hits: [], error: null }

  return (
    <div>
      <h1>Semantic search</h1>
      <p className="pub-meta">Search publications by meaning, not just keywords.</p>

      <form method="get" className="filters">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="e.g. deep learning for medical imaging"
          style={{ flex: 1, minWidth: 280, padding: '0.5rem', fontSize: '1rem' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Search
        </button>
      </form>

      {query && error && (
        <p>Search is temporarily unavailable ({error}). Please try again shortly.</p>
      )}

      {query && !error && hits.length === 0 && <p>No matches for “{query}”.</p>}

      {hits.map((hit) => (
        <article key={hit.publication.id} className="pub-item">
          <strong>
            {hit.publication.slug ? (
              <Link href={`/publications/${hit.publication.slug}`}>{hit.publication.title}</Link>
            ) : (
              hit.publication.title
            )}
          </strong>
          <div className="pub-meta">
            {hit.publication.venue ? `${hit.publication.venue} · ` : ''}
            {hit.publication.year}
            <span className="badge">score {hit.score.toFixed(2)}</span>
          </div>
        </article>
      ))}
    </div>
  )
}
