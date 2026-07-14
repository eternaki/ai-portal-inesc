import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { PubRow } from '@/components/PubRow'
import type { Publication } from '@/payload-types'

// Данные приходят из CMS — рендерим на каждый запрос, не при сборке
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

export default async function NewsItemPage(props: { params: Params }) {
  const { slug } = await props.params
  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'news',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })

  const item = result.docs[0]
  if (!item) notFound()

  const related = (item.relatedPublications ?? []).filter(
    (p): p is Publication => typeof p === 'object',
  )

  // Share-интенты: media-секция живёт в CMS, соцсети получают ссылку + текст
  const url = `https://mlkd.inesc-id.pt/news/${item.slug}` // заменить на прод-домен при деплое
  const shareLinkedIn = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
  const shareX = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(item.title)}`

  return (
    <article>
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
