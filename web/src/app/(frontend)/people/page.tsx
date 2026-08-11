import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { JsonLd } from '@/components/JsonLd'
import { PersonLinks } from '@/components/PersonLinks'
import { getDictionary } from '@/i18n/server'
import { initials, memberPhotoAlt, memberPhotoUrl, memberSameAs } from '@/lib/member'
import { PUBLISHED } from '@/lib/queries'
import type { Member, Publication } from '@/payload-types'

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

function PersonCard({
  member,
  t,
  publications,
  roleBadge,
}: {
  member: Member
  t: Awaited<ReturnType<typeof getDictionary>>['people']
  publications: Publication[]
  roleBadge?: string
}) {
  const photoUrl = memberPhotoUrl(member)

  return (
    <div id={member.slug ?? `member-${member.id}`} className="person-card">
      {photoUrl ? (
        <Image
          className="person-avatar person-avatar--photo"
          src={photoUrl}
          alt={memberPhotoAlt(member)}
          width={44}
          height={44}
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
      <PersonLinks member={member} emailLabel={t.email} websiteLabel={t.website} />
      {member.needsContactReview && <div className="pub-meta">{t.contactPending}</div>}
      {publications.length > 0 && (
        <div className="person-publications">
          <div className="person-publications-head">
            <span>{t.recentPublications}</span>
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
                    t={t.people}
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
                  t={t.people}
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
