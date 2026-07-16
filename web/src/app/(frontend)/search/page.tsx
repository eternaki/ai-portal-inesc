import React from 'react'
import Link from 'next/link'
import { getDictionary } from '@/i18n/server'

// Search calls the AI service on every request
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
    // The site must not fail if the AI service is unavailable
    return { hits: [], error: 'search service is unavailable' }
  }
}

export default async function SearchPage(props: { searchParams: SearchParams }) {
  const { q } = await props.searchParams
  const query = (q ?? '').trim()
  const { hits, error } = query ? await runSearch(query) : { hits: [], error: null }
  const t = await getDictionary()

  return (
    <div>
      <h1>{t.search.title}</h1>
      <p className="pub-meta">{t.search.meta}</p>

      <form method="get" className="search-form">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t.search.placeholder}
          aria-label={t.search.ariaQuery}
        />
        <button className="btn" type="submit">
          {t.search.button}
        </button>
      </form>

      {!query && (
        <div className="filters">
          {t.search.examples.map((ex) => (
            <Link key={ex} href={`/search?q=${encodeURIComponent(ex)}`}>
              {ex}
            </Link>
          ))}
        </div>
      )}

      {query && error && (
        <div className="empty">
          {t.search.unavailableBefore}
          {error}
          {t.search.unavailableAfter}
        </div>
      )}

      {query && !error && hits.length === 0 && (
        <div className="empty">
          {t.search.noMatchesBefore}
          {query}
          {t.search.noMatchesAfter}
        </div>
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
            <span className="badge">{t.search.match} {(hit.score * 100).toFixed(0)}%</span>
          </div>
        </article>
      ))}
    </div>
  )
}
