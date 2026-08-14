import React from 'react'
import Link from 'next/link'
import type { News } from '@/payload-types'
import { dateLocale, type Locale } from '@/i18n/config'

// One news card, shared by /news and the homepage teaser — they were two copies
// of the same markup, which is how the two drifted apart.
export function NewsCard({ item, locale, color }: { item: News; locale: Locale; color: string }) {
  const cover = typeof item.coverImage === 'object' ? item.coverImage : null
  const coverUrl = cover?.sizes?.card?.url ?? cover?.url

  return (
    <Link href={item.slug ? `/news/${item.slug}` : '#'} className="news-card">
      <div className="news-card-media" style={{ background: `${color}1a` }}>
        {coverUrl ? (
          // Payload already emits a sized `card` variant, so next/image would only
          // re-optimise an optimised file.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={cover?.alt || ''} />
        ) : (
          <span className="news-card-media-mark" style={{ color }}>
            MLKD
          </span>
        )}
      </div>
      <div className="news-card-body">
        <div className="news-date">
          {item.date
            ? new Date(item.date).toLocaleDateString(dateLocale[locale], {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : ''}
        </div>
        <div className="pub-title">{item.title}</div>
      </div>
      <div className="news-card-accent" style={{ background: color }} />
    </Link>
  )
}
