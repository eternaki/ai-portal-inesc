import React from 'react'
import Link from 'next/link'
import type { Publication } from '@/payload-types'
import { getDictionary } from '@/i18n/server'

// Server component: reads the active locale so the "summary" badge is localized.
export async function PubRow({ pub }: { pub: Publication }) {
  const t = await getDictionary()
  const hasAiSummary = pub.aiSummaryStatus && pub.aiSummaryStatus !== 'none'
  return (
    <article className="pub-item">
      <div className="pub-title">
        {pub.slug ? <Link href={`/publications/${pub.slug}`}>{pub.title}</Link> : pub.title}
      </div>
      <div className="pub-meta">{(pub.authors ?? []).map((a) => a.name).join(', ')}</div>
      <div className="pub-meta">
        <span className="mono">
          {pub.year}
          {pub.venue ? ` · ${pub.venue}` : ''}
        </span>{' '}
        <span className="badge">{pub.type}</span>{' '}
        {hasAiSummary ? <span className="badge badge-ai">{t.pubRow.summary}</span> : null}
        {pub.doi ? (
          <>
            {' '}
            <a className="mono" href={`https://doi.org/${pub.doi}`} target="_blank" rel="noreferrer">
              doi
            </a>
          </>
        ) : null}
      </div>
    </article>
  )
}
