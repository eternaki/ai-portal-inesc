import React from 'react'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'

// Данные приходят из CMS — рендерим на каждый запрос, не при сборке
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

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
    [summary.tldr, summary.problem, summary.method, summary.results, summary.takeaways].some(
      Boolean,
    )

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
          {summary.tldr && (
            <p>
              <strong>TL;DR:</strong> {summary.tldr}
            </p>
          )}
          {summary.problem && (
            <p>
              <strong>Problem:</strong> {summary.problem}
            </p>
          )}
          {summary.method && (
            <p>
              <strong>Method:</strong> {summary.method}
            </p>
          )}
          {summary.results && (
            <p>
              <strong>Results:</strong> {summary.results}
            </p>
          )}
          {summary.takeaways && (
            <p>
              <strong>Takeaways:</strong> {summary.takeaways}
            </p>
          )}
        </section>
      ) : null}

      {pub.abstract && (
        <section>
          <h2>Abstract</h2>
          <p>{pub.abstract}</p>
        </section>
      )}
    </article>
  )
}
