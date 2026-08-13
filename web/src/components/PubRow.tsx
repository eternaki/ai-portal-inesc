import React from 'react'
import Link from 'next/link'
import type { Publication } from '@/payload-types'
import { getDictionary } from '@/i18n/server'
import { renderSciText } from '@/lib/sciText'

function AuthorName({ author }: { author: NonNullable<Publication['authors']>[number] }) {
  const member = typeof author.member === 'object' ? author.member : null
  if (member?.slug) {
    return (
      <Link className="author-member-link" href={`/people/${member.slug}`}>
        {author.name}
      </Link>
    )
  }
  return <>{author.name}</>
}

// Server component: reads the active locale so the "summary" badge is localized.
// `clusterColor` (from the /map topic model) ties this row back to the map —
// omit it and the row just renders without a tag, no dependency on the AI service.
export async function PubRow({ pub, clusterColor }: { pub: Publication; clusterColor?: string | null }) {
  const t = await getDictionary()
  const hasAiSummary = pub.aiSummaryStatus && pub.aiSummaryStatus !== 'none'
  return (
    <article className="pub-item">
      <div className="pub-title">
        {clusterColor && (
          <Link
            href={`/map?pub=${pub.id}`}
            className="pub-cluster-dot"
            style={{ background: clusterColor }}
            title={t.pubRow.viewOnMap}
          />
        )}
        {pub.slug ? (
          <Link href={`/publications/${pub.slug}`}>{renderSciText(pub.title)}</Link>
        ) : (
          renderSciText(pub.title)
        )}
      </div>
      <div className="pub-meta">
        {(pub.authors ?? []).map((author, index) => (
          <React.Fragment key={`${author.name}-${index}`}>
            {index > 0 ? ', ' : ''}
            <AuthorName author={author} />
          </React.Fragment>
        ))}
      </div>
      <div className="pub-meta">
        <span className="mono">
          {pub.year}
          {pub.venue ? ` · ${pub.venue}` : ''}
        </span>{' '}
        <span className="badge">{pub.type}</span>{' '}
        {hasAiSummary ? <span className="badge badge-ai">{t.pubRow.summary}</span> : null}
      </div>
    </article>
  )
}
