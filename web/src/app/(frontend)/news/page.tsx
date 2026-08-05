import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary, getLocale } from '@/i18n/server'
import { dateLocale } from '@/i18n/config'

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
        {news.docs.map((n, i) => {
          const color = CARD_COLORS[i % CARD_COLORS.length]
          const cover = typeof n.coverImage === 'object' ? n.coverImage : null
          const coverUrl = cover?.sizes?.card?.url ?? cover?.url
          return (
            <Link key={n.id} href={n.slug ? `/news/${n.slug}` : '#'} className="news-card">
              <div className="news-card-media" style={{ background: `${color}1a` }}>
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="" />
                ) : (
                  <span className="news-card-media-mark" style={{ color }}>
                    MLKD
                  </span>
                )}
              </div>
              <div className="news-card-body">
                <div className="news-date">
                  {n.date
                    ? new Date(n.date).toLocaleDateString(dateLocale[locale], {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : ''}
                </div>
                <div className="pub-title">{n.title}</div>
              </div>
              <div className="news-card-accent" style={{ background: color }} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
