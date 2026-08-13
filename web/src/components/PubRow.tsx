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
//
// Two columns: a year rail, then the work. Everything used to be stacked in one
// column, so 226 rows repeated title / authors / "2026 · venue · badge · badge"
// with nothing for the eye to travel down.
//
// `showYear` is what makes the rail worth having. These lists are sorted by year
// and a year holds twenty-odd papers, so printing it on every row spelled
// "2026 2026 2026 2026" down the page — repetition, not information. Printed
// only when it changes, the rail becomes the timeline the sort already implies.
// Callers pass it from the sequence they are rendering; a lone row keeps its year.
export async function PubRow({
  pub,
  clusterColor,
  showYear = true,
}: {
  pub: Publication
  clusterColor?: string | null
  showYear?: boolean
}) {
  const t = await getDictionary()
  const hasAiSummary = pub.aiSummaryStatus && pub.aiSummaryStatus !== 'none'
  return (
    <article className="pub-item">
      <div className="pub-rail">
        {showYear ? <span className="pub-year">{pub.year}</span> : null}
      </div>

      <div className="pub-body">
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

        <div className="pub-authors">
          {(pub.authors ?? []).map((author, index) => (
            <React.Fragment key={`${author.name}-${index}`}>
              {index > 0 ? ', ' : ''}
              <AuthorName author={author} />
            </React.Fragment>
          ))}
        </div>

        <div className="pub-venue">
          {pub.type ? <span className="pub-kind">{pub.type}</span> : null}
          {pub.venue ? <span className="mono">{pub.venue}</span> : null}
          {hasAiSummary ? <span className="badge badge-ai">{t.pubRow.summary}</span> : null}
        </div>
      </div>
    </article>
  )
}
