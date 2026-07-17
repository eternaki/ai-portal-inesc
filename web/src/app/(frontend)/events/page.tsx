import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { getDictionary, getLocale } from '@/i18n/server'
import { dateLocale } from '@/i18n/config'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Events' }

export default async function EventsPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const locale = await getLocale()
  const now = new Date().toISOString()

  const events = await payload.find({
    collection: 'events',
    sort: '-date',
    limit: 100,
    depth: 0,
  })

  const upcoming = events.docs.filter((e) => e.date && e.date >= now).reverse()
  const past = events.docs.filter((e) => !e.date || e.date < now)

  const fmt = (d?: string | null) =>
    d
      ? new Date(d).toLocaleDateString(dateLocale[locale], {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : ''

  const renderEvent = (e: (typeof events.docs)[number]) => (
    <div key={e.id} className="news-item">
      <div className="news-date">
        {fmt(e.date)}
        {e.location ? ` · ${e.location}` : ''}
      </div>
      <div className="pub-title">
        {e.link ? (
          <a href={e.link} target="_blank" rel="noreferrer">
            {e.title}
          </a>
        ) : (
          e.title
        )}
      </div>
      {e.speaker && <div className="pub-meta">{e.speaker}</div>}
      {e.description ? (
        <div className="rich-text" style={{ fontSize: '0.92rem' }}>
          <RichText data={e.description} />
        </div>
      ) : null}
    </div>
  )

  return (
    <div>
      <h1>{t.events.title}</h1>
      {events.docs.length === 0 && <div className="empty">{t.events.empty}</div>}

      {upcoming.length > 0 && (
        <section>
          <h2>{t.events.upcoming}</h2>
          {upcoming.map(renderEvent)}
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2>{t.events.past}</h2>
          {past.map(renderEvent)}
        </section>
      )}
    </div>
  )
}
