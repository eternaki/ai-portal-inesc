import React from 'react'
import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'

// Данные приходят из CMS — рендерим на каждый запрос, не при сборке
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Publications' }

type SearchParams = Promise<{ year?: string; type?: string }>

export default async function PublicationsPage(props: { searchParams: SearchParams }) {
  const { year, type } = await props.searchParams
  const payload = await getPayload({ config })

  const where: Where = {}
  if (year) where.year = { equals: Number(year) }
  if (type) where.type = { equals: type }

  const result = await payload.find({
    collection: 'publications',
    where,
    sort: '-year',
    limit: 100,
    depth: 0,
  })

  const years = Array.from(
    new Set(result.docs.map((d) => d.year).filter(Boolean)),
  ).sort((a, b) => Number(b) - Number(a))

  return (
    <div>
      <h1>Publications</h1>

      <div className="filters">
        <Link href="/publications">All</Link>
        {years.map((y) => (
          <Link key={y} href={`/publications?year=${y}`}>
            {y}
          </Link>
        ))}
      </div>

      {result.docs.length === 0 && <p>No publications yet — run the ingest pipeline.</p>}

      {result.docs.map((pub) => (
        <article key={pub.id} className="pub-item">
          <strong>
            {pub.slug ? <Link href={`/publications/${pub.slug}`}>{pub.title}</Link> : pub.title}
          </strong>
          <div className="pub-meta">
            {(pub.authors ?? []).map((a) => a.name).join(', ')}
          </div>
          <div className="pub-meta">
            {pub.venue ? `${pub.venue} · ` : ''}
            {pub.year} <span className="badge">{pub.type}</span>
            {pub.doi ? (
              <>
                {' · '}
                <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noreferrer">
                  DOI
                </a>
              </>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}
