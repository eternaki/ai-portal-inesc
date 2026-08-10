import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Scatter } from '@/components/Scatter'
import { CountUp } from '@/components/CountUp'
import { JsonLd, ORGANIZATION } from '@/components/JsonLd'
import { PubRow } from '@/components/PubRow'
import { NewsCard } from '@/components/NewsCard'
import { clusterColor, fetchPublicationClusters } from '@/lib/clusterColors'
import { PUBLISHED } from '@/lib/queries'
import { getDictionary, getLocale } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

// Same family as the /map cluster palette — ties the homepage back to the
// "map of knowledge" concept without pretending themes map 1:1 to clusters.
const THEME_COLORS = [
  '#2553a5', '#b97a10', '#2a7f62', '#8c3fa8', '#c04b3d', '#1b7f9e',
]

export default async function HomePage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const locale = await getLocale()

  const [pubCount, memberCount, recentPubs, themes, openTopics, news, clusters] = await Promise.all([
    payload.count({ collection: 'publications', where: PUBLISHED }),
    // Active members only — alumni and completed memberships would inflate the
    // headline number into a claim about people who have already left.
    payload.count({ collection: 'members', where: { membershipStatus: { equals: 'active' } } }),
    payload.find({ collection: 'publications', where: PUBLISHED, sort: '-year', limit: 5, depth: 0 }),
    payload.find({ collection: 'research-themes', limit: 6, depth: 0 }),
    payload.count({ collection: 'dissertations', where: { status: { equals: 'open' } } }),
    payload.find({ collection: 'news', sort: '-date', limit: 2, depth: 1 }),
    fetchPublicationClusters(),
  ])

  const years = recentPubs.docs.map((d) => d.year).filter(Boolean) as number[]
  const minYear = await payload
    .find({ collection: 'publications', where: PUBLISHED, sort: 'year', limit: 1, depth: 0 })
    .then((r) => r.docs[0]?.year ?? (years.length ? Math.min(...years) : null))

  return (
    <div>
      <JsonLd data={ORGANIZATION} />
      <section className="hero">
        <Scatter className="hero-scatter" count={46} dark />
        <div className="hero-content">
          <div className="eyebrow">INESC-ID · Lisboa</div>
          <h1>Machine Learning &amp; Knowledge Discovery</h1>
          <p className="hero-lede">{t.home.lede}</p>
          <div className="hero-stats">
            <div className="stat">
              <b><CountUp value={pubCount.totalDocs} /></b>
              <span>{t.home.statPublications}</span>
            </div>
            <div className="stat">
              <b><CountUp value={memberCount.totalDocs} /></b>
              <span>{t.home.statPeople}</span>
            </div>
            {minYear ? (
              <div className="stat">
                <b><CountUp value={minYear} suffix="—" /></b>
                <span>{t.home.statActiveSince}</span>
              </div>
            ) : null}
            {openTopics.totalDocs > 0 ? (
              <div className="stat">
                <b><CountUp value={openTopics.totalDocs} /></b>
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
            {themes.docs.map((theme, i) => {
              const color = THEME_COLORS[i % THEME_COLORS.length]
              const pubCount = theme.keyPublications?.length ?? 0
              return (
                <div key={theme.id} className="card theme-tile" style={{ borderTopColor: color }}>
                  <h3>
                    {theme.slug ? (
                      <Link href={`/research#${theme.slug}`}>{theme.name}</Link>
                    ) : (
                      theme.name
                    )}
                  </h3>
                  {pubCount > 0 && (
                    <span className="theme-tile-count mono" style={{ color }}>
                      {pubCount} {pubCount === 1 ? t.home.themePub : t.home.themePubs}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>{t.home.recentHead}</h2>
          <Link href="/publications">{t.home.all} {pubCount.totalDocs} →</Link>
        </div>
        {recentPubs.docs.map((pub) => (
          <PubRow key={pub.id} pub={pub} clusterColor={clusters.has(pub.id) ? clusterColor(clusters.get(pub.id)!) : null} />
        ))}
      </section>

      {news.docs.length > 0 && (
        <section>
          <div className="section-head">
            <h2>{t.home.newsHead}</h2>
            <Link href="/news">{t.home.allNews}</Link>
          </div>
          <div className="news-card-grid">
            {news.docs.map((item, i) => (
              <NewsCard
                key={item.id}
                item={item}
                locale={locale}
                color={THEME_COLORS[(i + 2) % THEME_COLORS.length]}
              />
            ))}
          </div>
        </section>
      )}

      <section className="join-banner">
        <div className="join-banner-inner">
          <div>
            <h2 className="join-banner-head">{t.home.joinHead}</h2>
            <p className="join-banner-lede">{t.home.joinLede}</p>
            <Link className="btn" href="/dissertations?status=open">
              {t.home.browseTopics}
            </Link>
          </div>
          {openTopics.totalDocs > 0 && (
            <div className="join-banner-stat">
              <b>{openTopics.totalDocs}</b>
              <span>{t.home.joinStatLabel}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
