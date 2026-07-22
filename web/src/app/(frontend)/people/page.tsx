import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { JsonLd } from '@/components/JsonLd'
import { getDictionary } from '@/i18n/server'
import { PUBLISHED } from '@/lib/queries'
import type { Media, Member, Publication } from '@/payload-types'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'People' }

const ROLE_ORDER = [
  { value: 'faculty', key: 'roleFaculty' },
  { value: 'researcher', key: 'roleResearchers' },
  { value: 'phd', key: 'rolePhd' },
  { value: 'msc', key: 'roleMsc' },
  { value: 'alumni', key: 'roleAlumni' },
] as const

const SECONDARY_STATUSES = [
  { value: 'suspended', key: 'statusSuspended' },
  { value: 'completed', key: 'statusCompleted' },
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

function PersonLinks({
  member,
  emailLabel,
  websiteLabel,
}: {
  member: Member
  emailLabel: string
  websiteLabel: string
}) {
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

function memberPublicationMap(publications: Publication[]) {
  const map = new Map<number, Publication[]>()
  for (const publication of publications) {
    for (const author of publication.authors ?? []) {
      const member = author.member
      const memberId = member && typeof member === 'object' ? member.id : member
      if (typeof memberId !== 'number') continue
      if (!map.has(memberId)) map.set(memberId, [])
      map.get(memberId)?.push(publication)
    }
  }
  return map
}

function roleLabel(member: Member, t: Awaited<ReturnType<typeof getDictionary>>['people']) {
  const role = ROLE_ORDER.find((item) => item.value === member.role)
  return role ? t[role.key] : member.role
}

function memberPhoto(member: Member): Media | null {
  return member.photo && typeof member.photo === 'object' ? member.photo : null
}

function PersonCard({
  member,
  emailLabel,
  websiteLabel,
  publications,
  roleBadge,
}: {
  member: Member
  emailLabel: string
  websiteLabel: string
  publications: Publication[]
  roleBadge?: string
}) {
  const photo = memberPhoto(member)
  const photoUrl = photo?.sizes?.thumbnail?.url || photo?.url

  return (
    <div id={member.slug ?? `member-${member.id}`} className="person-card">
      {photoUrl ? (
        <img
          className="person-avatar person-avatar--photo"
          src={photoUrl}
          alt={photo.alt || member.name}
          loading="lazy"
        />
      ) : (
        <div className="person-avatar">{initials(member.name)}</div>
      )}
      <strong>{member.name}</strong>
      {roleBadge && <span className="badge">{roleBadge}</span>}
      {(member.researchInterests ?? []).length > 0 && (
        <div className="pub-meta">{(member.researchInterests ?? []).join(' · ')}</div>
      )}
      <PersonLinks member={member} emailLabel={emailLabel} websiteLabel={websiteLabel} />
      {member.needsContactReview && <div className="pub-meta">Contact pending review</div>}
      {publications.length > 0 && (
        <div className="person-publications">
          <div className="person-publications-head">
            <span>Recent publications</span>
            <span className="badge">{publications.length}</span>
          </div>
          <ul>
            {publications.slice(0, 3).map((publication) => (
              <li key={publication.id}>
                <span>
                  {publication.slug ? (
                    <Link href={`/publications/${publication.slug}`}>{publication.title}</Link>
                  ) : (
                    publication.title
                  )}
                </span>
                {publication.year ? <span className="mono">{publication.year}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default async function PeoplePage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()

  const [result, publicationsResult] = await Promise.all([
    payload.find({
      collection: 'members',
      sort: 'name',
      limit: 500,
      depth: 1,
    }),
    payload.find({
      collection: 'publications',
      where: PUBLISHED,
      sort: '-year',
      limit: 1000,
      depth: 1,
    }),
  ])
  const publicationsByMember = memberPublicationMap(publicationsResult.docs)

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

      <section>
        <h2>{t.people.statusActive}</h2>
        {ROLE_ORDER.map(({ value, key }) => {
          const group = result.docs.filter(
            (member) => (member.membershipStatus ?? 'active') === 'active' && member.role === value,
          )
          if (group.length === 0) return null
          return (
            <section key={value}>
              <h3>{t.people[key]}</h3>
              <div className="people-grid">
                {group.map((member) => (
                  <PersonCard
                    key={member.id}
                    member={member}
                    emailLabel={t.people.email}
                    websiteLabel={t.people.website}
                    publications={publicationsByMember.get(member.id) ?? []}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </section>

      {SECONDARY_STATUSES.map(({ value, key }) => {
        const group = result.docs.filter((member) => member.membershipStatus === value)
        if (group.length === 0) return null
        return (
          <section key={value}>
            <h2>{t.people[key]}</h2>
            <div className="people-grid">
              {group.map((member) => (
                <PersonCard
                  key={member.id}
                  member={member}
                  emailLabel={t.people.email}
                  websiteLabel={t.people.website}
                  publications={publicationsByMember.get(member.id) ?? []}
                  roleBadge={roleLabel(member, t.people)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {result.docs.length === 0 && <div className="empty">{t.people.empty}</div>}
    </div>
  )
}
