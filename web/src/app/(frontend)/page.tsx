import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Scatter } from '@/components/Scatter'
import { JsonLd, ORGANIZATION } from '@/components/JsonLd'
import { PubRow } from '@/components/PubRow'
import { getDictionary, getLocale } from '@/i18n/server'
import { dateLocale } from '@/i18n/config'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const locale = await getLocale()

  const [pubCount, memberCount, recentPubs, themes, openTopics, news] = await Promise.all([
    payload.count({ collection: 'publications' }),
    payload.count({ collection: 'members' }),
    payload.find({ collection: 'publications', sort: '-year', limit: 5, depth: 0 }),
    payload.find({ collection: 'research-themes', limit: 6, depth: 0 }),
    payload.count({ collection: 'thesis-topics', where: { status: { equals: 'open' } } }),
    payload.find({ collection: 'news', sort: '-date', limit: 2, depth: 0 }),
  ])

  const years = recentPubs.docs.map((d) => d.year).filter(Boolean) as number[]
  const minYear = await payload
    .find({ collection: 'publications', sort: 'year', limit: 1, depth: 0 })
    .then((r) => r.docs[0]?.year ?? (years.length ? Math.min(...years) : null))

  return (
    <div>
      <JsonLd data={ORGANIZATION} />
      <section className="hero">
        <Scatter className="hero-scatter" />
        <div className="hero-content">
          <div className="eyebrow">INESC-ID · Lisboa</div>
          <h1>Machine Learning &amp; Knowledge Discovery</h1>
          <p className="hero-lede">{t.home.lede}</p>
          <div className="hero-stats">
            <div className="stat">
              <b>{pubCount.totalDocs}</b>
              <span>{t.home.statPublications}</span>
            </div>
            <div className="stat">
              <b>{memberCount.totalDocs}</b>
              <span>{t.home.statPeople}</span>
            </div>
            {minYear ? (
              <div className="stat">
                <b>{minYear}—</b>
                <span>{t.home.statActiveSince}</span>
              </div>
            ) : null}
            {openTopics.totalDocs > 0 ? (
              <div className="stat">
                <b>{openTopics.totalDocs}</b>
                <span>{t.home.statOpenTopics}</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {themes.docs.length > 0 && (
        <section>
          <div className="section-head">
            <h2>{t.home.themesHead}</h2>
            <Link href="/research">{t.home.allThemes}</Link>
          </div>
          <div className="card-grid">
            {themes.docs.map((theme) => (
              <div key={theme.id} className="card">
                <h3>
                  {theme.slug ? (
                    <Link href={`/research#${theme.slug}`}>{theme.name}</Link>
                  ) : (
                    theme.name
                  )}
                </h3>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>{t.home.recentHead}</h2>
          <Link href="/publications">{t.home.all} {pubCount.totalDocs} →</Link>
        </div>
        {recentPubs.docs.map((pub) => (
          <PubRow key={pub.id} pub={pub} />
        ))}
      </section>

      {news.docs.length > 0 && (
        <section>
          <div className="section-head">
            <h2>{t.home.newsHead}</h2>
            <Link href="/news">{t.home.allNews}</Link>
          </div>
          {news.docs.map((n) => (
            <div key={n.id} className="news-item">
              <div className="news-date">
                {n.date ? new Date(n.date).toLocaleDateString(dateLocale[locale], { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
              </div>
              <div className="pub-title">
                {n.slug ? <Link href={`/news/${n.slug}`}>{n.title}</Link> : n.title}
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2>{t.home.joinHead}</h2>
        <p style={{ maxWidth: '54ch' }}>{t.home.joinLede}</p>
        <Link className="btn" href="/opportunities">
          {t.home.browseTopics}
        </Link>
      </section>
    </div>
  )
}
