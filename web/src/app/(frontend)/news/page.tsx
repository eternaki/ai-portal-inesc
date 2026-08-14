import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary, getLocale } from '@/i18n/server'
import { NewsCard } from '@/components/NewsCard'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'News' }

const CARD_COLORS = ['#2553a5', '#b97a10', '#2a7f62', '#8c3fa8', '#c04b3d', '#1b7f9e']

export default async function NewsPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const locale = await getLocale()
  const news = await payload.find({
    collection: 'news',
    sort: '-date',
    limit: 50,
    depth: 1,
  })

  return (
    <div>
      <h1>{t.news.title}</h1>
      {news.docs.length === 0 && <div className="empty">{t.news.empty}</div>}
      <div className="news-card-grid">
        {news.docs.map((item, i) => (
          <NewsCard
            key={item.id}
            item={item}
            locale={locale}
            color={CARD_COLORS[i % CARD_COLORS.length]}
          />
        ))}
      </div>
    </div>
  )
}
