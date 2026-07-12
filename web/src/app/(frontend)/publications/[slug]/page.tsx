import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Publication } from '@/payload-types'

// Данные приходят из CMS — рендерим на каждый запрос, не при сборке
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

function PubList({ title, pubs }: { title: string; pubs: Publication[] }) {
  if (pubs.length === 0) return null
  return (
    <section>
      <h2>{title}</h2>
      {pubs.map((p) => (
        <div key={p.id} className="pub-item">
          {p.slug ? <Link href={`/publications/${p.slug}`}>{p.title}</Link> : p.title}
          <span className="pub-meta">
            {' '}
            ({p.year}
            {p.venue ? ` · ${p.venue}` : ''})
          </span>
        </div>
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
    pub.aiSummaryStatus !== 'none' &&
    summary &&
    SUMMARY_SECTIONS.some(([key]) => summary[key])

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
      <h1>{pub.title}</h1>
      <p className="pub-meta">
        {(pub.authors ?? []).map((a) => a.name).join(', ')}
        <br />
        {pub.venue ? `${pub.venue} · ` : ''}
        {pub.year} <span className="badge">{pub.type}</span>
        {pub.doi ? (
          <>
            {' · '}
            <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noreferrer">
              DOI
            </a>
          </>
        ) : null}
      </p>

      {hasSummary && summary ? (
        <section>
          <h2>
            Summary{' '}
            <span className="badge">
              {pub.aiSummaryStatus === 'edited' ? 'AI-generated, human-edited' : 'AI-generated'}
            </span>
          </h2>
          {SUMMARY_SECTIONS.map(([key, label]) =>
            summary[key] ? (
              <p key={key}>
                <strong>{label}:</strong> {summary[key]}
              </p>
            ) : null,
          )}
        </section>
      ) : null}

      {pub.abstract && (
        <section>
          <h2>Abstract</h2>
          <p>{pub.abstract}</p>
        </section>
      )}

      <PubList title="References within the group" pubs={references} />
      <PubList title="Cited by (group publications)" pubs={citedBy} />

      {!hasSummary && !pub.abstract && references.length === 0 && citedBy.length === 0 && (
        <p className="pub-meta">
          No summary or abstract available for this publication yet. See the{' '}
          {pub.doi ? (
            <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noreferrer">
              original publication
            </a>
          ) : (
            'original venue'
          )}{' '}
          for details.
        </p>
      )}
    </article>
  )
}
