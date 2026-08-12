import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { OpenPosition } from '@/payload-types'
import { getDictionary, getLocale } from '@/i18n/server'
import { dateLocale } from '@/i18n/config'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Open positions' }

export default async function OpenPositionsPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const locale = await getLocale()

  // Closed positions stay in the database for the record but never reach the site.
  const result = await payload.find({
    collection: 'open-positions',
    where: { status: { equals: 'open' } },
    sort: 'deadline',
    limit: 100,
    depth: 0,
  })

  const formatDeadline = (value?: string | null) =>
    value
      ? new Date(value).toLocaleDateString(dateLocale[locale], {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null

  const renderPosition = (position: OpenPosition) => {
    const deadline = formatDeadline(position.deadline)
    return (
      <article key={position.id} id={position.slug ?? undefined} className="card">
        <h3>{position.title}</h3>
        <div className="pub-meta">
          <span className="badge badge-open">{t.openPositions.kinds[position.kind]}</span>
          {deadline ? (
            <>
              {' '}
              <span className="mono">
                {t.openPositions.deadline} {deadline}
              </span>
            </>
          ) : null}
        </div>
        {position.description ? (
          <div className="rich-text" style={{ fontSize: '0.92rem' }}>
            <RichText data={position.description} />
          </div>
        ) : null}
        <div className="card-foot">
          {position.applyUrl ? (
            <a className="btn" href={position.applyUrl} target="_blank" rel="noreferrer">
              {t.openPositions.apply} →
            </a>
          ) : position.contactEmail ? (
            <a className="btn" href={`mailto:${position.contactEmail}`}>
              {t.openPositions.contact} →
            </a>
          ) : null}
        </div>
      </article>
    )
  }

  return (
    <div>
      <h1>{t.openPositions.title}</h1>
      <p className="pub-meta" style={{ maxWidth: '60ch' }}>
        {t.openPositions.meta}
      </p>

      {result.docs.length === 0 ? (
        // Empty is this page's normal state — the group opens a funded post once or
        // twice a year. So it gets a designed answer rather than a dashed "nothing
        // here" box, and the message is derived from the query: the legacy site
        // hand-types "no open positions" and contradicts itself the moment someone
        // forgets to edit it.
        <section className="positions-empty">
          <h2>{t.openPositions.emptyHead}</h2>
          <p>{t.openPositions.emptyLede}</p>
          <Link className="btn" href="/dissertations?status=open">
            {t.openPositions.emptyDissertations} →
          </Link>
        </section>
      ) : (
        <div className="card-grid">{result.docs.map(renderPosition)}</div>
      )}
    </div>
  )
}
