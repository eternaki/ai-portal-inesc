import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { JsonLd } from '@/components/JsonLd'

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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .join('')
    .toUpperCase()

export default async function PeoplePage() {
  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'members',
    sort: 'name',
    limit: 500,
    depth: 0,
  })

  const peopleJsonLd = {
    '@context': 'https://schema.org',
    '@graph': result.docs.map((m) => ({
      '@type': 'Person',
      name: m.name,
      ...(m.orcid ? { sameAs: `https://orcid.org/${m.orcid}` } : {}),
      affiliation: { '@type': 'ResearchOrganization', name: 'MLKD, INESC-ID' },
    })),
  }

  return (
    <div>
      <JsonLd data={peopleJsonLd} />
      <h1>People</h1>
      <p className="pub-meta">
        Members edit their own profiles — <a href="/admin">sign in</a> to update yours.
      </p>
      {ROLE_ORDER.map(({ value, label }) => {
        const group = result.docs.filter((m) => m.role === value)
        if (group.length === 0) return null
        return (
          <section key={value}>
            <h2>{label}</h2>
            <div className="people-grid">
              {group.map((m) => (
                <div key={m.id} className="person-card">
                  <div className="person-avatar">{initials(m.name)}</div>
                  <strong>{m.name}</strong>
                  {(m.researchInterests ?? []).length > 0 && (
                    <div className="pub-meta">{(m.researchInterests ?? []).join(' · ')}</div>
                  )}
                  <div className="person-links">
                    {m.links?.linkedin && (
                      <a href={m.links.linkedin} target="_blank" rel="noreferrer">
                        LinkedIn
                      </a>
                    )}
                    {m.orcid && (
                      <a href={`https://orcid.org/${m.orcid}`} target="_blank" rel="noreferrer">
                        ORCID
                      </a>
                    )}
                    {m.links?.personalPage && (
                      <a href={m.links.personalPage} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    )}
                    {m.showEmail && m.email && <a href={`mailto:${m.email}`}>Email</a>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
      {result.docs.length === 0 && (
        <div className="empty">No members yet — add them in the admin panel.</div>
      )}
    </div>
  )
}
