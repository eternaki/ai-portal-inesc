import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { getDictionary, getLocale } from '@/i18n/server'
import { dateLocale } from '@/i18n/config'
import type { Media } from '@/payload-types'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Reading Groups' }

function mediaFile(file: number | Media | null | undefined) {
  return file && typeof file === 'object' ? file : null
}

export default async function ReadingGroupsPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const locale = await getLocale()
  const now = new Date().toISOString()

  const result = await payload.find({
    collection: 'reading-groups',
    sort: '-date',
    limit: 100,
    depth: 1,
  })

  const upcoming = result.docs.filter((item) => item.date && item.date >= now).reverse()
  const past = result.docs.filter((item) => !item.date || item.date < now)

  const fmt = (date?: string | null) =>
    date
      ? new Date(date).toLocaleDateString(dateLocale[locale], {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : ''

  const renderItem = (item: (typeof result.docs)[number]) => (
    <article key={item.id} className="news-item">
      <div className="news-date">
        {fmt(item.date)}
        {item.presenter ? ` · ${item.presenter}` : ''}
      </div>
      <div className="pub-title">{item.title}</div>
      {item.paperTitle && <div className="pub-meta">{item.paperTitle}</div>}
      {item.description ? (
        <div className="rich-text" style={{ fontSize: '0.92rem' }}>
          <RichText data={item.description} />
        </div>
      ) : null}
      {(item.materials ?? []).length > 0 && (
        <div className="person-publications">
          <div className="person-publications-head">
            <span>{t.readingGroups.materials}</span>
            <span className="badge">{item.materials?.length ?? 0}</span>
          </div>
          <ul>
            {(item.materials ?? []).map((material) => {
              const file = mediaFile(material.file)
              if (!file?.url) return null
              return (
                <li key={material.id}>
                  <Link href={file.url} target="_blank" rel="noreferrer">
                    {material.label}
                  </Link>
                  {file.filename ? <span className="mono">{file.filename}</span> : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </article>
  )

  return (
    <div>
      <h1>{t.readingGroups.title}</h1>
      <p className="pub-meta">{t.readingGroups.meta}</p>
      {result.docs.length === 0 && <div className="empty">{t.readingGroups.empty}</div>}

      {upcoming.length > 0 && (
        <section>
          <h2>{t.readingGroups.upcoming}</h2>
          {upcoming.map(renderItem)}
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2>{t.readingGroups.past}</h2>
          {past.map(renderItem)}
        </section>
      )}
    </div>
  )
}
