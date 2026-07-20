import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Publication } from '@/payload-types'
import { PubRow } from '@/components/PubRow'
import { JsonLd } from '@/components/JsonLd'
import { Attachments } from '@/components/Attachments'
import { SITE_URL } from '@/lib/site'
import { published, PUBLISHED } from '@/lib/queries'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

async function findPublication(slug: string): Promise<Publication | null> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'publications',
    where: published({ slug: { equals: slug } }),
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

const SUMMARY_KEYS = [
  'tldr',
  'problem',
  'method',
  'results',
  'takeaways',
  'industry',
  'impact',
] as const

export default async function PublicationPage(props: { params: Params }) {
  const { slug } = await props.params
  const payload = await getPayload({ config })
  const t = await getDictionary()

  const pub = await findPublication(slug)
  if (!pub) notFound()

  const summary = pub.aiSummary
  const hasSummary =
    pub.aiSummaryStatus !== 'none' && summary && SUMMARY_KEYS.some((key) => summary[key])

  const sectionLabels: Record<(typeof SUMMARY_KEYS)[number], string> = {
    tldr: t.pub.sectionTldr,
    problem: t.pub.sectionProblem,
    method: t.pub.sectionMethod,
    results: t.pub.sectionResults,
    takeaways: t.pub.sectionTakeaways,
    industry: t.pub.sectionIndustry,
    impact: t.pub.sectionImpact,
  }

  // Group works this paper references, and group works that cite this paper
  const [references, citedBy] = await Promise.all([
    (pub.referencedWorks ?? []).length > 0
      ? payload
          .find({
            collection: 'publications',
            where: published({ openalexId: { in: pub.referencedWorks as string[] } }),
            limit: 10,
            depth: 0,
          })
          .then((r) => r.docs)
      : Promise.resolve([]),
    pub.openalexId
      ? payload
          .find({
            collection: 'publications',
            where: published({ referencedWorks: { contains: pub.openalexId } }),
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
              <span className="mono">{pub.citationCount} {t.pub.citations}</span>
            </>
          ) : null}
        </p>
        {(() => {
          const original = pub.originalUrl || (pub.doi ? `https://doi.org/${pub.doi}` : pub.pdfUrl)
          return original ? (
            <p>
              <a className="btn" href={original} target="_blank" rel="noreferrer">
                {t.pub.viewOriginal} →
              </a>
            </p>
          ) : null
        })()}
      </div>

      {hasSummary && summary ? (
        <div className="summary-card">
          <h2>
            {t.pub.summary}{' '}
            <span className="badge badge-ai">
              {pub.aiSummaryStatus === 'edited' ? t.pub.aiEdited : t.pub.aiGenerated}
            </span>
          </h2>
          <dl>
            {SUMMARY_KEYS.map((key) =>
              summary[key] ? (
                <React.Fragment key={key}>
                  <dt>{sectionLabels[key]}</dt>
                  <dd>{summary[key]}</dd>
                </React.Fragment>
              ) : null,
            )}
          </dl>
        </div>
      ) : null}

      {pub.abstract && (
        <section className="abstract">
          <h2>{t.pub.abstract}</h2>
          <p>{pub.abstract}</p>
        </section>
      )}

      <Attachments
        items={pub.attachments ?? []}
        heading={t.pub.materials}
        labels={{
          materials: t.pub.materials,
          download: t.pub.download,
          openFile: t.pub.openFile,
          viewCode: t.pub.viewCode,
          open: t.pub.open,
        }}
      />

      <PubList title={t.pub.referencesWithin} pubs={references} />
      <PubList title={t.pub.citedBy} pubs={citedBy} />

      {!hasSummary && !pub.abstract && references.length === 0 && citedBy.length === 0 && (
        <div className="empty">
          {t.pub.emptyBefore}
          {pub.doi ? (
            <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noreferrer">
              {t.pub.originalPublication}
            </a>
          ) : (
            t.pub.originalVenue
          )}
          {t.pub.emptyAfter}
        </div>
      )}

      <p style={{ marginTop: '2.5rem' }}>
        <Link href="/publications">{t.pub.back}</Link>
      </p>
    </article>
  )
}
