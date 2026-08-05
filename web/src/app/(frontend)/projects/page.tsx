import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Member } from '@/payload-types'
import { getDictionary } from '@/i18n/server'
import { MemberAvatarStack } from '@/components/MemberAvatarStack'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Projects' }

const KIND_ICON: Record<string, string> = {
  national: 'M8 1 3 4v5c0 3.3 2.1 5.6 5 6.5 2.9-.9 5-3.2 5-6.5V4L8 1Z',
  international: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM1 8h14M8 1a10 10 0 0 1 0 14M8 1a10 10 0 0 0 0 14',
  industry: 'M2 6h12v8H2V6ZM5 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
}

function KindIcon({ kind }: { kind?: string | null }) {
  const d = KIND_ICON[kind ?? ''] ?? KIND_ICON.national
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

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
                <span className="badge badge-open badge-icon">
                  <KindIcon kind={p.kind} /> {p.kind}
                </span>{' '}
                <span className="mono">
                  {p.yearStart ?? ''}
                  {p.yearEnd ? `–${p.yearEnd}` : p.yearStart ? '–' : ''}
                </span>
              </div>
              {p.funding && <div className="pub-meta">{t.projects.funding} {p.funding}</div>}
              {members.length > 0 && (
                <div className="card-foot">
                  <MemberAvatarStack members={members} max={5} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
