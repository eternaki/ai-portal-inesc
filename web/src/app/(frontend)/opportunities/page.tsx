import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { Member } from '@/payload-types'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Opportunities' }

export default async function OpportunitiesPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const topics = await payload.find({
    collection: 'thesis-topics',
    limit: 100,
    depth: 1,
    sort: '-createdAt',
  })

  const open = topics.docs.filter((t) => t.status === 'open')
  const taken = topics.docs.filter((t) => t.status !== 'open')

  return (
    <div>
      <h1>{t.opportunities.title}</h1>
      <p className="pub-meta" style={{ maxWidth: '60ch' }}>
        {t.opportunities.metaBefore}
        <a href="/people">{t.opportunities.anyFaculty}</a>
        {t.opportunities.metaAfter}
      </p>

      <h2>
        {t.opportunities.openHead}{' '}
        {open.length > 0 && <span className="badge badge-open">{open.length}</span>}
      </h2>
      {open.length === 0 && <div className="empty">{t.opportunities.emptyOpen}</div>}
      <div className="card-grid">
        {open.map((topic) => {
          const advisors = (topic.advisors ?? []).filter((a): a is Member => typeof a === 'object')
          return (
            <div key={topic.id} className="card">
              <h3>{topic.title}</h3>
              <div className="pub-meta">
                <span className="badge badge-open">{topic.level === 'phd' ? 'PhD' : 'MSc'}</span>
              </div>
              {topic.description ? (
                <div className="rich-text" style={{ fontSize: '0.92rem' }}>
                  <RichText data={topic.description} />
                </div>
              ) : null}
              {advisors.length > 0 && (
                <div className="card-foot">
                  {t.opportunities.advisor} {advisors.map((a) => a.name).join(', ')}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {taken.length > 0 && (
        <>
          <h2>{t.opportunities.assignedHead}</h2>
          {taken.slice(0, 10).map((topic) => (
            <div key={topic.id} className="pub-item">
              <div className="pub-title">{topic.title}</div>
              <div className="pub-meta">
                <span className="badge">{topic.level === 'phd' ? 'PhD' : 'MSc'}</span>{' '}
                <span className="badge">{topic.status}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
