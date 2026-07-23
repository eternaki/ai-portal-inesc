import React from 'react'
import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { PubRow } from '@/components/PubRow'
import { published, PUBLISHED } from '@/lib/queries'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Publications' }

type SearchParams = Promise<{ year?: string; type?: string }>

export default async function PublicationsPage(props: { searchParams: SearchParams }) {
  const { year, type } = await props.searchParams
  const payload = await getPayload({ config })
  const t = await getDictionary()

  const filter: Where = {}
  if (year) filter.year = { equals: Number(year) }
  if (type) filter.type = { equals: type }

  const [result, allYears] = await Promise.all([
    payload.find({
      collection: 'publications',
      where: published(filter),
      sort: '-year',
      limit: 100,
      depth: 0,
    }),
    payload
      .find({ collection: 'publications', where: PUBLISHED, limit: 1000, depth: 0, select: { year: true } })
      .then((r) =>
        Array.from(new Set(r.docs.map((d) => d.year).filter(Boolean))).sort(
          (a, b) => Number(b) - Number(a),
        ),
      ),
  ])

  return (
    <div>
      <div className="section-head">
        <h1>{t.publications.title}</h1>
        <span>
          <Link href="/search">{t.publications.semanticSearch}</Link>{' '}
          <Link
            className="btn btn-quiet"
            href="/admin/collections/publications/create"
            title={t.publications.addTitle}
            style={{ marginLeft: '0.8rem' }}
          >
            {t.publications.add}
          </Link>
        </span>
      </div>
      <p className="pub-meta">
        {result.totalDocs} {t.publications.metaSuffix}
      </p>

      <div className="filters">
        <Link href="/publications" className={!year ? 'active' : ''}>
          {t.publications.allYears}
        </Link>
        {allYears.slice(0, 18).map((y) => (
          <Link
            key={y}
            href={`/publications?year=${y}`}
            className={String(y) === year ? 'active' : ''}
          >
            {y}
          </Link>
        ))}
      </div>

      {result.docs.length === 0 && (
        <div className="empty">{t.publications.empty}</div>
      )}

      {result.docs.map((pub) => (
        <PubRow key={pub.id} pub={pub} />
      ))}
    </div>
  )
}
