import React from 'react'
import Link from 'next/link'
import type { Dissertation, Member } from '@/payload-types'
import { getDictionary } from '@/i18n/server'

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

// Server component so the stage badge and labels follow the active locale, the
// same way PubRow does.
export async function DissertationRow({ item }: { item: Dissertation }) {
  const t = await getDictionary()
  const supervisors = item.supervisors ?? []

  return (
    <article className="pub-item">
      <div className="pub-title">
        {item.slug ? <Link href={`/dissertations/${item.slug}`}>{item.title}</Link> : item.title}
      </div>
      {item.author?.name && (
        <div className="pub-meta">
          <PersonName name={item.author.name} member={item.author.member} />
        </div>
      )}
      {supervisors.length > 0 && (
        <div className="pub-meta">
          {t.dissertations.supervisedBy}{' '}
          {supervisors.map((s, i) => (
            <React.Fragment key={`${s.name}-${i}`}>
              {i > 0 ? ', ' : ''}
              <PersonName name={s.name} member={s.member} />
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="pub-meta">
        <span className="badge">{t.dissertations.stages[item.status]}</span>{' '}
        <span className="badge">{item.level === 'phd' ? 'PhD' : 'MSc'}</span>
      </div>
    </article>
  )
}
