import React from 'react'
import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/server'
import { published } from '@/lib/queries'

// Search calls the AI service on every request
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Search' }

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

const PUB_TYPES = ['journal', 'conference', 'workshop', 'book', 'preprint', 'other'] as const

type SearchParams = Promise<{ q?: string; type?: string }>

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

// Textual fallback: when the AI service (hybrid search) is unavailable, still
// return keyword matches straight from the CMS so search never goes fully dark.
async function textualFallback(q: string, type?: string): Promise<SearchHit[]> {
  try {
    const payload = await getPayload({ config })
    const filter: Where = {
      or: [{ title: { like: q } }, { abstract: { like: q } }, { venue: { like: q } }],
    }
    if (type) filter.type = { equals: type }
    const res = await payload.find({
      collection: 'publications',
      where: published(filter),
      sort: '-year',
      limit: 20,
      depth: 0,
    })
    return res.docs.map((p) => ({ score: 0, publication: p as SearchHit['publication'] }))
  } catch {
    return []
  }
}

async function runSearch(
  q: string,
  type?: string,
): Promise<{ hits: SearchHit[]; error: string | null; fallback: boolean }> {
  const params = new URLSearchParams({ q, limit: '20' })
  if (type) params.set('type', type)
  try {
    const res = await fetch(`${AI_URL}/search?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      // Degrade to keyword search rather than showing nothing.
      return { hits: await textualFallback(q, type), error: null, fallback: true }
    }
    const data = await res.json()
    return { hits: data.results ?? [], error: null, fallback: false }
  } catch {
    // The site must not fail if the AI service is unavailable
    return { hits: await textualFallback(q, type), error: null, fallback: true }
  }
}

export default async function SearchPage(props: { searchParams: SearchParams }) {
  const { q, type } = await props.searchParams
  const query = (q ?? '').trim()
  const activeType = PUB_TYPES.includes(type as (typeof PUB_TYPES)[number]) ? type : undefined
  const { hits, error, fallback } = query
    ? await runSearch(query, activeType)
    : { hits: [], error: null, fallback: false }
  const t = await getDictionary()

  const typeHref = (ty?: string) => {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (ty) p.set('type', ty)
    return `/search?${p.toString()}`
  }

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
        {activeType && <input type="hidden" name="type" value={activeType} />}
        <button className="btn" type="submit">
          {t.search.button}
        </button>
      </form>

      {query && (
        <div className="filters">
          <Link href={typeHref(undefined)} className={!activeType ? 'active' : ''}>
            {t.search.allTypes}
          </Link>
          {PUB_TYPES.map((ty) => (
            <Link key={ty} href={typeHref(ty)} className={activeType === ty ? 'active' : ''}>
              {t.search.types[ty]}
            </Link>
          ))}
        </div>
      )}

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
            {!fallback && hit.score > 0 && (
              <span className="badge">
                {t.search.match} {(hit.score * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
