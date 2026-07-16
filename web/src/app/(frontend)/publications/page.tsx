import React from 'react'
import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { PubRow } from '@/components/PubRow'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Publications' }

type SearchParams = Promise<{ year?: string; type?: string }>

export default async function PublicationsPage(props: { searchParams: SearchParams }) {
  const { year, type } = await props.searchParams
  const payload = await getPayload({ config })

  const where: Where = {}
  if (year) where.year = { equals: Number(year) }
  if (type) where.type = { equals: type }

  const [result, allYears] = await Promise.all([
    payload.find({
      collection: 'publications',
      where,
      sort: '-year',
      limit: 100,
      depth: 0,
    }),
    payload
      .find({ collection: 'publications', limit: 1000, depth: 0, select: { year: true } })
      .then((r) =>
        Array.from(new Set(r.docs.map((d) => d.year).filter(Boolean))).sort(
          (a, b) => Number(b) - Number(a),
        ),
      ),
  ])

  return (
    <div>
      <div className="section-head">
        <h1>Publications</h1>
        <span>
          <Link href="/search">Semantic search →</Link>{' '}
          <a
            className="btn btn-quiet"
            href="/admin/collections/publications/create"
            title="Members: add a publication via the admin panel; the summary is generated automatically"
            style={{ marginLeft: '0.8rem' }}
          >
            + Add publication
          </a>
        </span>
      </div>
      <p className="pub-meta">
        {result.totalDocs} indexed from OpenAlex · summaries generated automatically and
        editable by the group
      </p>

      <div className="filters">
        <Link href="/publications" className={!year ? 'active' : ''}>
          all years
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
        <div className="empty">No publications match this filter yet.</div>
      )}

      {result.docs.map((pub) => (
        <PubRow key={pub.id} pub={pub} />
      ))}
    </div>
  )
}
