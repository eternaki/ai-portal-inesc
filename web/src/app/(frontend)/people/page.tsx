import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { JsonLd } from '@/components/JsonLd'
import { getDictionary } from '@/i18n/server'
import type { Member } from '@/payload-types'

// Data comes from the CMS; render on each request, not at build time.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'People' }

const ROLE_ORDER = [
  { value: 'faculty', key: 'roleFaculty' },
  { value: 'researcher', key: 'roleResearchers' },
  { value: 'phd', key: 'rolePhd' },
  { value: 'msc', key: 'roleMsc' },
  { value: 'alumni', key: 'roleAlumni' },
] as const

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .join('')
    .toUpperCase()

const visible = (value: unknown, toggle?: boolean | null) => Boolean(value) && toggle !== false

const visibleValue = (value?: string | null, toggle?: boolean | null) =>
  visible(value, toggle) ? value : null

const memberSameAs = (member: Member) =>
  [
    visibleValue(member.links?.linkedin, member.showLinkedIn),
    visibleValue(member.links?.github, member.showGitHub),
    visibleValue(member.links?.personalPage, member.showPersonalPage),
    visibleValue(member.links?.tecnicoPage, member.showTecnicoPage),
    visibleValue(member.links?.googleScholar, member.showGoogleScholar),
    visible(member.orcid, member.showORCID) ? `https://orcid.org/${member.orcid}` : null,
    visible(member.cienciaId, member.showCienciaId)
      ? `https://www.cienciavitae.pt/${member.cienciaId}`
      : null,
    visible(member.dblpKey, member.showDBLP) ? `https://dblp.org/pid/${member.dblpKey}` : null,
  ].filter((url): url is string => Boolean(url))

function PersonLinks({ member, emailLabel, websiteLabel }: { member: Member; emailLabel: string; websiteLabel: string }) {
  const linkedin = visibleValue(member.links?.linkedin, member.showLinkedIn)
  const github = visibleValue(member.links?.github, member.showGitHub)
  const tecnicoPage = visibleValue(member.links?.tecnicoPage, member.showTecnicoPage)
  const googleScholar = visibleValue(member.links?.googleScholar, member.showGoogleScholar)
  const personalPage = visibleValue(member.links?.personalPage, member.showPersonalPage)

  return (
    <div className="person-links">
      {linkedin && (
        <a href={linkedin} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
      )}
      {github && (
        <a href={github} target="_blank" rel="noreferrer">
          GitHub
        </a>
      )}
      {visible(member.orcid, member.showORCID) && (
        <a href={`https://orcid.org/${member.orcid}`} target="_blank" rel="noreferrer">
          ORCID
        </a>
      )}
      {visible(member.cienciaId, member.showCienciaId) && (
        <a href={`https://www.cienciavitae.pt/${member.cienciaId}`} target="_blank" rel="noreferrer">
          Ciencia Vitae
        </a>
      )}
      {visible(member.dblpKey, member.showDBLP) && (
        <a href={`https://dblp.org/pid/${member.dblpKey}`} target="_blank" rel="noreferrer">
          DBLP
        </a>
      )}
      {tecnicoPage && (
        <a href={tecnicoPage} target="_blank" rel="noreferrer">
          Tecnico
        </a>
      )}
      {googleScholar && (
        <a href={googleScholar} target="_blank" rel="noreferrer">
          Google Scholar
        </a>
      )}
      {personalPage && (
        <a href={personalPage} target="_blank" rel="noreferrer">
          {websiteLabel}
        </a>
      )}
      {member.showEmail && member.email && <a href={`mailto:${member.email}`}>{emailLabel}</a>}
    </div>
  )
}

export default async function PeoplePage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()

  const result = await payload.find({
    collection: 'members',
    sort: 'name',
    limit: 500,
    depth: 0,
  })

  const peopleJsonLd = {
    '@context': 'https://schema.org',
    '@graph': result.docs.map((member) => {
      const sameAs = memberSameAs(member)
      return {
        '@type': 'Person',
        name: member.name,
        ...(sameAs.length > 0 ? { sameAs } : {}),
        affiliation: { '@type': 'ResearchOrganization', name: 'MLKD, INESC-ID' },
      }
    }),
  }

  return (
    <div>
      <JsonLd data={peopleJsonLd} />
      <h1>{t.people.title}</h1>
      <p className="pub-meta">
        {t.people.metaBefore}
        <Link href="/admin">{t.people.signIn}</Link>
        {t.people.metaAfter}
      </p>
      {ROLE_ORDER.map(({ value, key }) => {
        const group = result.docs.filter((member) => member.role === value)
        if (group.length === 0) return null
        return (
          <section key={value}>
            <h2>{t.people[key]}</h2>
            <div className="people-grid">
              {group.map((member) => (
                <div key={member.id} className="person-card">
                  <div className="person-avatar">{initials(member.name)}</div>
                  <strong>{member.name}</strong>
                  {(member.researchInterests ?? []).length > 0 && (
                    <div className="pub-meta">{(member.researchInterests ?? []).join(' · ')}</div>
                  )}
                  <PersonLinks member={member} emailLabel={t.people.email} websiteLabel={t.people.website} />
                </div>
              ))}
            </div>
          </section>
        )
      })}
      {result.docs.length === 0 && <div className="empty">{t.people.empty}</div>}
    </div>
  )
}
