import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { JsonLd } from '@/components/JsonLd'
import { PersonCard } from '@/components/PersonCard'
import { getDictionary } from '@/i18n/server'
import { memberSameAs } from '@/lib/member'

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

export default async function PeoplePage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()

  const result = await payload.find({
    collection: 'members',
    sort: 'name',
    limit: 500,
    depth: 1,
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
                  <PersonCard key={member.id} member={member} />
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
                <PersonCard key={member.id} member={member} />
              ))}
            </div>
          </section>
        )
      })}

      {result.docs.length === 0 && <div className="empty">{t.people.empty}</div>}
    </div>
  )
}
