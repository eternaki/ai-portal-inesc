import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Scatter } from '@/components/Scatter'
import { PubRow } from '@/components/PubRow'

// Данные приходят из CMS — рендерим на каждый запрос, не при сборке
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const payload = await getPayload({ config })

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
      <section className="hero">
        <Scatter className="hero-scatter" />
        <div className="hero-content">
          <div className="eyebrow">INESC-ID · Lisboa</div>
          <h1>Machine Learning &amp; Knowledge Discovery</h1>
          <p className="hero-lede">
            We study how machines learn from data — and we make what we learn easy to find.
            Every publication on this site is indexed, semantically searchable, and summarised
            in plain language.
          </p>
          <div className="hero-stats">
            <div className="stat">
              <b>{pubCount.totalDocs}</b>
              <span>publications</span>
            </div>
            <div className="stat">
              <b>{memberCount.totalDocs}</b>
              <span>people</span>
            </div>
            {minYear ? (
              <div className="stat">
                <b>{minYear}—</b>
                <span>active since</span>
              </div>
            ) : null}
            {openTopics.totalDocs > 0 ? (
              <div className="stat">
                <b>{openTopics.totalDocs}</b>
                <span>open thesis topics</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {themes.docs.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Research themes</h2>
            <Link href="/research">All themes →</Link>
          </div>
          <div className="card-grid">
            {themes.docs.map((t) => (
              <div key={t.id} className="card">
                <h3>{t.slug ? <Link href={`/research#${t.slug}`}>{t.name}</Link> : t.name}</h3>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Recent publications</h2>
          <Link href="/publications">All {pubCount.totalDocs} →</Link>
        </div>
        {recentPubs.docs.map((pub) => (
          <PubRow key={pub.id} pub={pub} />
        ))}
      </section>

      {news.docs.length > 0 && (
        <section>
          <div className="section-head">
            <h2>News</h2>
            <Link href="/news">All news →</Link>
          </div>
          {news.docs.map((n) => (
            <div key={n.id} className="news-item">
              <div className="news-date">
                {n.date ? new Date(n.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
              </div>
              <div className="pub-title">
                {n.slug ? <Link href={`/news/${n.slug}`}>{n.title}</Link> : n.title}
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2>Join us</h2>
        <p style={{ maxWidth: '54ch' }}>
          Looking for an MSc or PhD topic in machine learning? We keep an updated list of open
          topics and research challenges.
        </p>
        <Link className="btn" href="/opportunities">
          Browse open topics
        </Link>
      </section>
    </div>
  )
}
