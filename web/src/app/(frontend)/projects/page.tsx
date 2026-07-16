import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Member } from '@/payload-types'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const projects = await payload.find({
    collection: 'projects',
    sort: '-yearStart',
    limit: 100,
    depth: 1,
  })

  return (
    <div>
      <h1>{t.projects.title}</h1>
      <p className="pub-meta">{t.projects.meta}</p>

      {projects.docs.length === 0 && <div className="empty">{t.projects.empty}</div>}

      <div className="card-grid">
        {projects.docs.map((p) => {
          const members = (p.members ?? []).filter((m): m is Member => typeof m === 'object')
          return (
            <div key={p.id} className="card">
              <h3>{p.url ? <a href={p.url}>{p.title}</a> : p.title}</h3>
              <div className="pub-meta">
                <span className="badge badge-open">{p.kind}</span>{' '}
                <span className="mono">
                  {p.yearStart ?? ''}
                  {p.yearEnd ? `–${p.yearEnd}` : p.yearStart ? '–' : ''}
                </span>
              </div>
              {p.funding && <div className="pub-meta">{t.projects.funding} {p.funding}</div>}
              {members.length > 0 && (
                <div className="card-foot">{members.map((m) => m.name).join(', ')}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
