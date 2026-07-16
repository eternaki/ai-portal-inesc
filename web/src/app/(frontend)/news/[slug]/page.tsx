import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { PubRow } from '@/components/PubRow'
import type { Publication } from '@/payload-types'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL } from '@/lib/site'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

async function findNews(slug: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'news',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] ?? null
}

export async function generateMetadata(props: { params: Params }) {
  const { slug } = await props.params
  const item = await findNews(slug)
  if (!item) return {}
  return {
    title: item.title,
    openGraph: { title: item.title, type: 'article', url: `${SITE_URL}/news/${item.slug}` },
  }
}

export default async function NewsItemPage(props: { params: Params }) {
  const { slug } = await props.params
  const item = await findNews(slug)
  if (!item) notFound()

  const related = (item.relatedPublications ?? []).filter(
    (p): p is Publication => typeof p === 'object',
  )

  // Share intents: the media section lives in the CMS, socials get a link + text
  const url = `${SITE_URL}/news/${item.slug}`
  const shareLinkedIn = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
  const shareX = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(item.title)}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: item.title,
    datePublished: item.date ?? undefined,
    publisher: { '@type': 'ResearchOrganization', name: 'MLKD, INESC-ID' },
  }

  return (
    <article>
      <JsonLd data={jsonLd} />
      <div className="article-head">
        <div className="news-date">
          {item.date
            ? new Date(item.date).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : ''}
        </div>
        <h1>{item.title}</h1>
      </div>

      {item.body ? (
        <div className="rich-text">
          <RichText data={item.body} />
        </div>
      ) : null}

      <div className="share-row">
        <a className="btn btn-quiet" href={shareLinkedIn} target="_blank" rel="noreferrer">
          Share on LinkedIn
        </a>
        <a className="btn btn-quiet" href={shareX} target="_blank" rel="noreferrer">
          Share on X
        </a>
      </div>

      {related.length > 0 && (
        <section>
          <h2>Related publications</h2>
          {related.map((p) => (
            <PubRow key={p.id} pub={p} />
          ))}
        </section>
      )}

      <p style={{ marginTop: '2.5rem' }}>
        <Link href="/news">← All news</Link>
      </p>
    </article>
  )
}
