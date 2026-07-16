import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Software & Datasets' }

export default async function SoftwarePage() {
  const payload = await getPayload({ config })
  const items = await payload.find({
    collection: 'software',
    sort: 'name',
    limit: 100,
    depth: 0,
  })

  return (
    <div>
      <h1>Software &amp; Datasets</h1>
      <p className="pub-meta">Tools and datasets released by the group.</p>

      {items.docs.length === 0 && (
        <div className="empty">Releases are being catalogued — check back soon.</div>
      )}

      <div className="card-grid">
        {items.docs.map((s) => (
          <div key={s.id} className="card">
            <h3>{s.repoUrl ? <a href={s.repoUrl}>{s.name}</a> : s.name}</h3>
            <div className="pub-meta">
              <span className="badge">{s.kind}</span>
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
