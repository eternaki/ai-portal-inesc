import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Publication } from '@/payload-types'
import { PubRow } from '@/components/PubRow'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL } from '@/lib/site'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

async function findPublication(slug: string): Promise<Publication | null> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'publications',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] ?? null
}

export async function generateMetadata(props: { params: Params }) {
  const { slug } = await props.params
  const pub = await findPublication(slug)
  if (!pub) return {}
  const description = (pub.aiSummary?.tldr || pub.abstract || '').slice(0, 200)
  return {
    title: pub.title,
    description,
    openGraph: {
      title: pub.title,
      description,
      type: 'article',
      url: `${SITE_URL}/publications/${pub.slug}`,
    },
  }
}

function PubList({ title, pubs }: { title: string; pubs: Publication[] }) {
  if (pubs.length === 0) return null
  return (
    <section>
      <h2>{title}</h2>
      {pubs.map((p) => (
        <PubRow key={p.id} pub={p} />
      ))}
    </section>
  )
}

const SUMMARY_SECTIONS = [
  ['tldr', 'TL;DR'],
  ['problem', 'Problem'],
  ['method', 'Method'],
  ['results', 'Results'],
  ['takeaways', 'Takeaways'],
  ['industry', 'For industry'],
  ['impact', 'Why it matters'],
] as const

export default async function PublicationPage(props: { params: Params }) {
  const { slug } = await props.params
  const payload = await getPayload({ config })

  const pub = await findPublication(slug)
  if (!pub) notFound()

  const summary = pub.aiSummary
  const hasSummary =
    pub.aiSummaryStatus !== 'none' && summary && SUMMARY_SECTIONS.some(([key]) => summary[key])

  // Group works this paper references, and group works that cite this paper
  const [references, citedBy] = await Promise.all([
    (pub.referencedWorks ?? []).length > 0
      ? payload
          .find({
            collection: 'publications',
            where: { openalexId: { in: pub.referencedWorks as string[] } },
            limit: 10,
            depth: 0,
          })
          .then((r) => r.docs)
      : Promise.resolve([]),
    pub.openalexId
      ? payload
          .find({
            collection: 'publications',
            where: { referencedWorks: { contains: pub.openalexId } },
            limit: 10,
            depth: 0,
          })
          .then((r) => r.docs)
      : Promise.resolve([]),
  ])

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: pub.title,
    datePublished: pub.year ? String(pub.year) : undefined,
    author: (pub.authors ?? []).map((a) => ({ '@type': 'Person', name: a.name })),
    ...(pub.doi ? { sameAs: `https://doi.org/${pub.doi}` } : {}),
    ...(pub.venue ? { isPartOf: { '@type': 'Periodical', name: pub.venue } } : {}),
    ...(pub.abstract ? { abstract: pub.abstract.slice(0, 500) } : {}),
  }

  return (
    <article>
      <JsonLd data={jsonLd} />
      <div className="article-head">
        <div className="eyebrow">
          {pub.type}
          {pub.venue ? ` · ${pub.venue}` : ''} · {pub.year}
        </div>
        <h1>{pub.title}</h1>
        <p className="pub-meta">
          {(pub.authors ?? []).map((a) => a.name).join(', ')}
          {pub.doi ? (
            <>
              {' · '}
              <a className="mono" href={`https://doi.org/${pub.doi}`} target="_blank" rel="noreferrer">
                doi:{pub.doi}
              </a>
            </>
          ) : null}
          {typeof pub.citationCount === 'number' ? (
            <>
              {' · '}
              <span className="mono">{pub.citationCount} citations</span>
            </>
          ) : null}
        </p>
      </div>

      {hasSummary && summary ? (
        <div className="summary-card">
          <h2>
            Summary{' '}
            <span className="badge badge-ai">
              {pub.aiSummaryStatus === 'edited' ? 'AI · human-edited' : 'AI-generated'}
            </span>
          </h2>
          <dl>
            {SUMMARY_SECTIONS.map(([key, label]) =>
              summary[key] ? (
                <React.Fragment key={key}>
                  <dt>{label}</dt>
                  <dd>{summary[key]}</dd>
                </React.Fragment>
              ) : null,
            )}
          </dl>
        </div>
      ) : null}

      {pub.abstract && (
        <section className="abstract">
          <h2>Abstract</h2>
          <p>{pub.abstract}</p>
        </section>
      )}

      <PubList title="References within the group" pubs={references} />
      <PubList title="Cited by (group publications)" pubs={citedBy} />

      {!hasSummary && !pub.abstract && references.length === 0 && citedBy.length === 0 && (
        <div className="empty">
          No summary or abstract available for this publication yet. See the{' '}
          {pub.doi ? (
            <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noreferrer">
              original publication
            </a>
          ) : (
            'original venue'
          )}{' '}
          for details.
        </div>
      )}

      <p style={{ marginTop: '2.5rem' }}>
        <Link href="/publications">← All publications</Link>
      </p>
    </article>
  )
}
