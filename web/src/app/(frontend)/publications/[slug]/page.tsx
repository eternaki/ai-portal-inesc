import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Publication } from '@/payload-types'
import { PubRow } from '@/components/PubRow'

// Данные приходят из CMS — рендерим на каждый запрос, не при сборке
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

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

  const result = await payload.find({
    collection: 'publications',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })

  const pub = result.docs[0]
  if (!pub) notFound()

  const summary = pub.aiSummary
  const hasSummary =
    pub.aiSummaryStatus !== 'none' && summary && SUMMARY_SECTIONS.some(([key]) => summary[key])

  // Работы группы, на которые ссылается эта статья, и работы группы, ссылающиеся на неё
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

  return (
    <article>
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
