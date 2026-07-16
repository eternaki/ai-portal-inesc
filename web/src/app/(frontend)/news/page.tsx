import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary, getLocale } from '@/i18n/server'
import { dateLocale } from '@/i18n/config'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'News' }

export default async function NewsPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const locale = await getLocale()
  const news = await payload.find({
    collection: 'news',
    sort: '-date',
    limit: 50,
    depth: 0,
  })

  return (
    <div>
      <h1>{t.news.title}</h1>
      {news.docs.length === 0 && <div className="empty">{t.news.empty}</div>}
      {news.docs.map((n) => (
        <div key={n.id} className="news-item">
          <div className="news-date">
            {n.date
              ? new Date(n.date).toLocaleDateString(dateLocale[locale], {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : ''}
          </div>
          <div className="pub-title">
            {n.slug ? <Link href={`/news/${n.slug}`}>{n.title}</Link> : n.title}
          </div>
        </div>
      ))}
    </div>
  )
}
