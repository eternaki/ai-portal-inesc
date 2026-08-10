import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Software & Datasets' }

function KindIcon({ kind }: { kind: string }) {
  if (kind === 'dataset') {
    return (
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <ellipse cx="8" cy="3.2" rx="6" ry="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M2 3.2v9.6c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V3.2M2 8c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default async function SoftwarePage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const items = await payload.find({
    collection: 'software',
    sort: 'name',
    limit: 100,
    depth: 0,
  })

  return (
    <div>
      <h1>{t.software.title}</h1>
      <p className="pub-meta">{t.software.meta}</p>

      {items.docs.length === 0 && <div className="empty">{t.software.empty}</div>}

      <div className="card-grid">
        {items.docs.map((s) => (
          <div key={s.id} id={s.slug ?? undefined} className="card">
            <h3>
              {s.repoUrl ? (
                <a href={s.repoUrl} target="_blank" rel="noreferrer">
                  {s.name}
                </a>
              ) : (
                s.name
              )}
            </h3>
            <div className="pub-meta">
              <span className="badge badge-icon">
                <KindIcon kind={s.kind} /> {s.kind}
              </span>
            </div>
            {s.description && <p className="pub-meta">{s.description}</p>}
            {s.repoUrl && (
              <div className="card-foot">
                <a className="mono" href={s.repoUrl} target="_blank" rel="noreferrer">
                  {s.repoUrl.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
