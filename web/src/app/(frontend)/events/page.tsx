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

  // Same rail as the publication list: the date stands apart from the meeting, and
  // the year is printed only when it changes, which turns eighty-three reading
  // groups into a timeline instead of a column of identical badges. The full date
  // used to be repeated in the body as well, one line under the badge that already
  // said it.
  const renderEvent = (e: (typeof events.docs)[number], previous?: (typeof events.docs)[number]) => {
    const date = e.date ? new Date(e.date) : null
    const previousDate = previous?.date ? new Date(previous.date) : null
    const showYear = !previousDate || previousDate.getFullYear() !== date?.getFullYear()

    return (
      <article key={e.id} id={e.slug ?? undefined} className="event-row">
        <div className="event-rail">
          {date && showYear && <span className="event-year">{date.getFullYear()}</span>}
          {date && (
            <span className="event-day">
              {date.getDate()} {date.toLocaleDateString(dateLocale[locale], { month: 'short' })}
            </span>
          )}
        </div>

        <div className="event-body">
          <div className="pub-title">
            {e.link ? (
              <a href={e.link} target="_blank" rel="noreferrer">
                {e.title}
              </a>
            ) : (
              e.title
            )}
          </div>
          {(e.speaker || e.location) && (
            <div className="event-meta">
              {e.speaker}
              {e.speaker && e.location ? ' · ' : ''}
              {e.location ? <span className="mono">{e.location}</span> : null}
            </div>
          )}
          {e.description ? (
            <div className="rich-text event-description">
              <RichText data={e.description} />
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  return (
    <div>
      <h1>{t.events.title}</h1>
      {events.docs.length === 0 && <div className="empty">{t.events.empty}</div>}

      {upcoming.length > 0 && (
        <section>
          <h2>{t.events.upcoming}</h2>
          {upcoming.map((e, i) => renderEvent(e, upcoming[i - 1]))}
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2>{t.events.past}</h2>
          {past.map((e, i) => renderEvent(e, past[i - 1]))}
        </section>
      )}
    </div>
  )
}
