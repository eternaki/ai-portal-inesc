import React from 'react'
import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { PubRow } from '@/components/PubRow'
import { YearHistogram } from '@/components/YearHistogram'
import { published, PUBLISHED } from '@/lib/queries'
import { getDictionary } from '@/i18n/server'
import { clusterColor, fetchPublicationClusters } from '@/lib/clusterColors'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Publications' }

const PER_PAGE = 50

const PUB_TYPES = ['journal', 'conference', 'workshop', 'book', 'preprint', 'other'] as const
type PubType = (typeof PUB_TYPES)[number]

type SearchParams = Promise<{ year?: string; type?: string; page?: string }>

export default async function PublicationsPage(props: { searchParams: SearchParams }) {
  const { year, type, page } = await props.searchParams
  const payload = await getPayload({ config })
  const t = await getDictionary()

  const activeType = PUB_TYPES.includes(type as PubType) ? (type as PubType) : undefined
  const activeYear = year && /^\d{4}$/.test(year) ? year : undefined
  const currentPage = Math.max(1, Number(page) || 1)

  const filter: Where = {}
  if (activeYear) filter.year = { equals: Number(activeYear) }
  if (activeType) filter.type = { equals: activeType }

  // Facets are built from the whole published set, not the current page, so the
  // chips always offer every year/type that exists — a filter that hides part of
  // the archive is worse than no filter.
  const [result, facets, clusters] = await Promise.all([
    payload.find({
      collection: 'publications',
      where: published(filter),
      sort: '-year',
      limit: PER_PAGE,
      page: currentPage,
      // depth 1 resolves author.member into an object; at depth 0 it is a bare id
      // and PubRow silently renders every author as plain text.
      depth: 1,
    }),
    payload
      .find({
        collection: 'publications',
        where: PUBLISHED,
        limit: 5000,
        depth: 0,
        select: { year: true, type: true },
      })
      .then((r) => {
        const perYear = new Map<number, number>()
        for (const doc of r.docs) {
          if (!doc.year) continue
          perYear.set(doc.year, (perYear.get(doc.year) ?? 0) + 1)
        }
        return {
          years: Array.from(perYear, ([year, count]) => ({ year, count })).sort(
            (a, b) => a.year - b.year,
          ),
          types: PUB_TYPES.filter((candidate) => r.docs.some((d) => d.type === candidate)),
        }
      }),
    fetchPublicationClusters(),
  ])

  // Every chip and page link keeps the other filters intact.
  const hrefWith = (patch: { year?: string | null; type?: string | null; page?: number }) => {
    const params = new URLSearchParams()
    const nextYear = patch.year === undefined ? activeYear : patch.year
    const nextType = patch.type === undefined ? activeType : patch.type
    if (nextYear) params.set('year', nextYear)
    if (nextType) params.set('type', nextType)
    if (patch.page && patch.page > 1) params.set('page', String(patch.page))
    const query = params.toString()
    return query ? `/publications?${query}` : '/publications'
  }

  const firstShown = result.totalDocs === 0 ? 0 : (currentPage - 1) * PER_PAGE + 1
  const lastShown = Math.min(currentPage * PER_PAGE, result.totalDocs)

  return (
    <div>
      <h1>{t.publications.title}</h1>
      <p className="pub-meta">{t.publications.metaSuffix}</p>

      <YearHistogram
        counts={facets.years}
        activeYear={activeYear}
        hrefForYear={(year) => hrefWith({ year, page: 1 })}
        labels={{
          allYears: t.publications.allYears,
          aria: t.publications.histogramAria,
        }}
      />

      <div className="filters">
        <Link href={hrefWith({ type: null, page: 1 })} className={!activeType ? 'active' : ''}>
          {t.publications.allTypes}
        </Link>
        {facets.types.map((pubType) => (
          <Link
            key={pubType}
            href={hrefWith({ type: pubType, page: 1 })}
            className={pubType === activeType ? 'active' : ''}
          >
            {t.publications.types[pubType]}
          </Link>
        ))}
      </div>

      {result.docs.length === 0 && <div className="empty">{t.publications.empty}</div>}

      {result.docs.map((pub) => (
        <PubRow
          key={pub.id}
          pub={pub}
          clusterColor={clusters.has(pub.id) ? clusterColor(clusters.get(pub.id)!) : null}
        />
      ))}

      {result.totalPages > 1 && (
        <nav className="pager" aria-label={t.publications.title}>
          {result.hasPrevPage ? (
            <Link className="btn btn-quiet" href={hrefWith({ page: currentPage - 1 })}>
              {t.publications.prevPage}
            </Link>
          ) : (
            <span />
          )}
          <span className="mono pager-status">
            {firstShown}–{lastShown} {t.publications.rangeOf} {result.totalDocs}
          </span>
          {result.hasNextPage ? (
            <Link className="btn btn-quiet" href={hrefWith({ page: currentPage + 1 })}>
              {t.publications.nextPage}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
