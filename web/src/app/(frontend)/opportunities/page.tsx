import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { Member } from '@/payload-types'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Opportunities' }

export default async function OpportunitiesPage() {
  const payload = await getPayload({ config })
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
      <h1>Opportunities</h1>
      <p className="pub-meta" style={{ maxWidth: '60ch' }}>
        Open MSc and PhD thesis topics supervised by the group. Interested?{' '}
        Contact the advisor listed on the topic — or reach out via{' '}
        <a href="/people">any faculty member</a> if you have your own idea.
      </p>

      <h2>
        Open topics{' '}
        {open.length > 0 && <span className="badge badge-open">{open.length}</span>}
      </h2>
      {open.length === 0 && (
        <div className="empty">
          No open topics right now — new topics are usually published before each semester.
          Speculative applications are welcome anytime.
        </div>
      )}
      <div className="card-grid">
        {open.map((t) => {
          const advisors = (t.advisors ?? []).filter((a): a is Member => typeof a === 'object')
          return (
            <div key={t.id} className="card">
              <h3>{t.title}</h3>
              <div className="pub-meta">
                <span className="badge badge-open">{t.level === 'phd' ? 'PhD' : 'MSc'}</span>
              </div>
              {t.description ? (
                <div className="rich-text" style={{ fontSize: '0.92rem' }}>
                  <RichText data={t.description} />
                </div>
              ) : null}
              {advisors.length > 0 && (
                <div className="card-foot">Advisor: {advisors.map((a) => a.name).join(', ')}</div>
              )}
            </div>
          )
        })}
      </div>

      {taken.length > 0 && (
        <>
          <h2>Recently assigned</h2>
          {taken.slice(0, 10).map((t) => (
            <div key={t.id} className="pub-item">
              <div className="pub-title">{t.title}</div>
              <div className="pub-meta">
                <span className="badge">{t.level === 'phd' ? 'PhD' : 'MSc'}</span>{' '}
                <span className="badge">{t.status}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
