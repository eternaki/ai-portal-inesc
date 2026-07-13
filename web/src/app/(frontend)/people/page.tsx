import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'

// Данные приходят из CMS — рендерим на каждый запрос, не при сборке
export const dynamic = 'force-dynamic'

export const metadata = { title: 'People' }

const ROLE_ORDER = [
  { value: 'faculty', label: 'Faculty' },
  { value: 'researcher', label: 'Researchers' },
  { value: 'phd', label: 'PhD Students' },
  { value: 'msc', label: 'MSc Students' },
  { value: 'alumni', label: 'Alumni' },
] as const

export default async function PeoplePage() {
  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'members',
    sort: 'name',
    limit: 500,
    depth: 0,
  })

  return (
    <div>
      <h1>People</h1>
      {ROLE_ORDER.map(({ value, label }) => {
        const group = result.docs.filter((m) => m.role === value)
        if (group.length === 0) return null
        return (
          <section key={value}>
            <h2>{label}</h2>
            <div className="people-grid">
              {group.map((m) => (
                <div key={m.id} className="person-card">
                  <strong>{m.name}</strong>
                  {(m.researchInterests ?? []).length > 0 && (
                    <div className="pub-meta">{(m.researchInterests ?? []).join(', ')}</div>
                  )}
                  <div className="pub-meta">
                    {m.links?.linkedin && (
                      <a href={m.links.linkedin} target="_blank" rel="noreferrer">
                        LinkedIn
                      </a>
                    )}{' '}
                    {m.orcid && (
                      <a href={`https://orcid.org/${m.orcid}`} target="_blank" rel="noreferrer">
                        ORCID
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
      {result.docs.length === 0 && <p>No members yet — add them in the admin panel.</p>}
    </div>
  )
}
