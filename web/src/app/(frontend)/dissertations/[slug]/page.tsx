import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { Dissertation, Member } from '@/payload-types'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL } from '@/lib/site'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

async function findDissertation(slug: string): Promise<Dissertation | null> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'dissertations',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] ?? null
}

export async function generateMetadata(props: { params: Params }) {
  const { slug } = await props.params
  const item = await findDissertation(slug)
  if (!item) return {}
  return {
    title: item.title,
    openGraph: {
      title: item.title,
      type: 'article',
      url: `${SITE_URL}/dissertations/${item.slug}`,
    },
  }
}

function PersonName({ name, member }: { name: string; member?: number | Member | null }) {
  const resolved = member && typeof member === 'object' ? member : null
  if (resolved?.slug) {
    return (
      <Link className="author-member-link" href={`/people#${resolved.slug}`}>
        {name}
      </Link>
    )
  }
  return <>{name}</>
}

export default async function DissertationPage(props: { params: Params }) {
  const { slug } = await props.params
  const t = await getDictionary()
  const item = await findDissertation(slug)
  if (!item) notFound()

  const supervisors = item.supervisors ?? []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Thesis',
    headline: item.title,
    inSupportOf: item.level === 'phd' ? 'PhD' : 'MSc',
    ...(item.author?.name ? { author: { '@type': 'Person', name: item.author.name } } : {}),
    ...(supervisors.length > 0
      ? { contributor: supervisors.map((s) => ({ '@type': 'Person', name: s.name })) }
      : {}),
    ...(item.fenixUrl ? { sameAs: item.fenixUrl } : {}),
  }

  return (
    <article>
      <JsonLd data={jsonLd} />
      <div className="article-head">
        <div className="pub-eyebrow">
          {t.dissertations.stages[item.status]} · {item.level === 'phd' ? 'PhD' : 'MSc'}
        </div>
        <h1>{item.title}</h1>
        {item.author?.name && (
          <p className="pub-meta">
            {t.dissertations.authoredBy}{' '}
            <PersonName name={item.author.name} member={item.author.member} />
          </p>
        )}
        {supervisors.length > 0 && (
          <p className="pub-meta">
            {t.dissertations.supervisedBy}{' '}
            {supervisors.map((s, i) => (
              <React.Fragment key={`${s.name}-${i}`}>
                {i > 0 ? ', ' : ''}
                <PersonName name={s.name} member={s.member} />
              </React.Fragment>
            ))}
          </p>
        )}
        {item.fenixUrl && (
          <p>
            <a className="btn" href={item.fenixUrl} target="_blank" rel="noreferrer">
              {t.dissertations.viewThesis} →
            </a>
          </p>
        )}
      </div>

      {item.description && (
        <section className="rich-text">
          <RichText data={item.description} />
        </section>
      )}

      {item.requisites && (
        <section className="summary-card">
          <h2>{t.dissertations.requisites}</h2>
          <div className="rich-text">
            <RichText data={item.requisites} />
          </div>
        </section>
      )}

      <p style={{ marginTop: '2.5rem' }}>
        <Link href="/dissertations">{t.dissertations.back}</Link>
      </p>
    </article>
  )
}
