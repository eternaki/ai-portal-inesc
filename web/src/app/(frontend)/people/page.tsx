import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { JsonLd } from '@/components/JsonLd'
import type { Member } from '@/payload-types'
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
] as const

// Membership is binary here, as it is on the group's own site: you are with the
// group or you have been. A third state existed briefly but nobody could say what
// it meant, so it was removed rather than left for a reader to guess at.
const SECONDARY_STATUSES = [{ value: 'completed', key: 'statusCompleted' }] as const

// Every group renders as avatar cards, including the ones with almost no
// photographs.
//
// This used to fall back to a plain list of names below a third coverage, because
// the placeholder was one flat wash for everybody and three portraits beside
// forty-two identical circles read as a page that had failed to load. The
// placeholder now gives each person their own colour (src/lib/avatar-tone.mjs),
// so that group reads as forty-five people rather than one repeated broken image
// — and the reason for hiding them is gone. Photo coverage is a fact about the
// group's old team page, not something a visitor should be shown two different
// page layouts over.
function PeopleGroup({ members }: { members: Member[] }) {
  return (
    <div className="people-grid">
      {members.map((member) => (
        <PersonCard key={member.id} member={member} />
      ))}
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
              <PeopleGroup members={group} />
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
            <PeopleGroup members={group} />
          </section>
        )
      })}

      {result.docs.length === 0 && <div className="empty">{t.people.empty}</div>}
    </div>
  )
}
