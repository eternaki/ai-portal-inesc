import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/server'
import { PUBLISHED } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Search' }

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

const ENTITY_TYPES = [
  'publications',
  'members',
  'projects',
  'thesis-topics',
  'software',
  'news',
  'events',
] as const

type EntityType = (typeof ENTITY_TYPES)[number]
type SearchParams = Promise<{ q?: string; type?: string }>

type UnifiedHit = {
  entity_type: EntityType
  id: number
  title: string | null
  slug?: string | null
  description?: string | null
  year?: number | null
  score: number
  source?: 'semantic' | 'lexical'
}

const ENTITY_LINK: Record<EntityType, (hit: UnifiedHit) => string> = {
  publications: (hit) => (hit.slug ? `/publications/${hit.slug}` : '/publications'),
  members: (hit) => (hit.slug ? `/people#${hit.slug}` : '/people'),
  projects: () => '/projects',
  'thesis-topics': () => '/opportunities',
  software: () => '/software',
  news: (hit) => (hit.slug ? `/news/${hit.slug}` : '/news'),
  events: () => '/events',
}

function textFromRich(node: unknown): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textFromRich).join(' ')
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>
    return [record.text, record.root, record.children].map(textFromRich).join(' ')
  }
  return ''
}

function yearFromDate(value: unknown): number | null {
  if (typeof value !== 'string' || value.length < 4) return null
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

function matchesQuery(hit: UnifiedHit, q: string) {
  const haystack = `${hit.title ?? ''} ${hit.description ?? ''}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .some((token) => haystack.includes(token))
}

async function textualFallback(q: string, type?: EntityType): Promise<UnifiedHit[]> {
  const payload = await getPayload({ config })
  const selectedTypes = type ? [type] : ENTITY_TYPES
  const results: UnifiedHit[] = []

  for (const entityType of selectedTypes) {
    if (entityType === 'publications') {
      const res = await payload.find({ collection: 'publications', where: PUBLISHED, sort: '-year', limit: 100, depth: 0 })
      results.push(
        ...res.docs.map((doc) => ({
          entity_type: 'publications' as const,
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          description: doc.abstract || doc.venue || null,
          year: doc.year,
          score: 0,
          source: 'lexical' as const,
        })),
      )
    } else if (entityType === 'members') {
      const res = await payload.find({ collection: 'members', sort: 'name', limit: 500, depth: 0 })
      results.push(
        ...res.docs.map((doc) => ({
          entity_type: 'members' as const,
          id: doc.id,
          title: doc.name,
          slug: doc.slug,
          description: (doc.researchInterests ?? []).join(', '),
          score: 0,
          source: 'lexical' as const,
        })),
      )
    } else if (entityType === 'projects') {
      const res = await payload.find({ collection: 'projects', sort: '-yearStart', limit: 200, depth: 0 })
      results.push(
        ...res.docs.map((doc) => ({
          entity_type: 'projects' as const,
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          description: textFromRich(doc.description),
          year: doc.yearStart,
          score: 0,
          source: 'lexical' as const,
        })),
      )
    } else if (entityType === 'thesis-topics') {
      const res = await payload.find({ collection: 'thesis-topics', sort: 'title', limit: 200, depth: 0 })
      results.push(
        ...res.docs.map((doc) => ({
          entity_type: 'thesis-topics' as const,
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          description: textFromRich(doc.description),
          score: 0,
          source: 'lexical' as const,
        })),
      )
    } else if (entityType === 'software') {
      const res = await payload.find({ collection: 'software', sort: 'name', limit: 200, depth: 0 })
      results.push(
        ...res.docs.map((doc) => ({
          entity_type: 'software' as const,
          id: doc.id,
          title: doc.name,
          slug: doc.slug,
          description: doc.description || doc.kind || null,
          score: 0,
          source: 'lexical' as const,
        })),
      )
    } else if (entityType === 'news') {
      const res = await payload.find({ collection: 'news', sort: '-date', limit: 200, depth: 0 })
      results.push(
        ...res.docs.map((doc) => ({
          entity_type: 'news' as const,
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          description: textFromRich(doc.body) || doc.socialSnippet || null,
          year: yearFromDate(doc.date),
          score: 0,
          source: 'lexical' as const,
        })),
      )
    } else if (entityType === 'events') {
      const res = await payload.find({ collection: 'events', sort: '-date', limit: 200, depth: 0 })
      results.push(
        ...res.docs.map((doc) => ({
          entity_type: 'events' as const,
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          description: textFromRich(doc.description) || doc.speaker || doc.location || null,
          year: yearFromDate(doc.date),
          score: 0,
          source: 'lexical' as const,
        })),
      )
    }
  }

  return results.filter((hit) => matchesQuery(hit, q)).slice(0, 30)
}

async function runSearch(q: string, type?: EntityType): Promise<{ hits: UnifiedHit[]; fallback: boolean }> {
  const params = new URLSearchParams({ q, limit: '30' })
  if (type) params.set('types', type)
  try {
    const res = await fetch(`${AI_URL}/search/all?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { hits: await textualFallback(q, type), fallback: true }
    const data = await res.json()
    return { hits: data.results ?? [], fallback: false }
  } catch {
    return { hits: await textualFallback(q, type), fallback: true }
  }
}

export default async function SearchPage(props: { searchParams: SearchParams }) {
  const { q, type } = await props.searchParams
  const query = (q ?? '').trim()
  const activeType = ENTITY_TYPES.includes(type as EntityType) ? (type as EntityType) : undefined
  const { hits, fallback } = query ? await runSearch(query, activeType) : { hits: [] as UnifiedHit[], fallback: false }
  const t = await getDictionary()

  const typeHref = (entityType?: EntityType) => {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (entityType) p.set('type', entityType)
    return `/search?${p.toString()}`
  }

  const entityLabel = (entityType: EntityType) =>
    t.search.entityTypes[entityType as keyof typeof t.search.entityTypes] ?? entityType

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
          {ENTITY_TYPES.map((entityType) => (
            <Link key={entityType} href={typeHref(entityType)} className={activeType === entityType ? 'active' : ''}>
              {entityLabel(entityType)}
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

      {query && hits.length === 0 && (
        <div className="empty">
          {t.search.noMatchesBefore}
          {query}
          {t.search.noMatchesAfter}
        </div>
      )}

      {query && hits.length > 0 && (
        <p className="pub-meta">
          {hits.length} {t.search.results}
          {fallback ? ` ${t.search.keywordFallback}` : ''}
        </p>
      )}

      {hits.map((hit) => (
        <article key={`${hit.entity_type}-${hit.id}`} className="pub-item">
          <div className="pub-title">
            <Link href={ENTITY_LINK[hit.entity_type](hit)}>{hit.title}</Link>
          </div>
          {hit.description && <p className="pub-meta">{hit.description.slice(0, 220)}</p>}
          <div className="pub-meta">
            <span className="badge">{entityLabel(hit.entity_type)}</span>{' '}
            {hit.year ? <span className="mono">{hit.year}</span> : null}
            {!fallback && hit.score > 0 && (
              <>
                {' '}
                <span className="badge">
                  {t.search.match} {(hit.score * 100).toFixed(0)}%
                </span>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
