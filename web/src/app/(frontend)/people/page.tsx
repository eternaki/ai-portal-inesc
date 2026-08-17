import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { JsonLd } from '@/components/JsonLd'
import type { Member } from '@/payload-types'
import { PersonCard } from '@/components/PersonCard'
import { PersonNameRow } from '@/components/PersonNameRow'
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

// Below this share of portraits, a group is listed by name instead of shown as
// avatar cards.
//
// Photo coverage is uneven for a reason no visitor can see: the only source of
// portraits is the group's old team page, a snapshot of whoever was here when it
// was last edited. Faculty, current PhDs and past MSc students are at 98-100%;
// the current MSc intake, who arrived after it, is at 7%. Three portraits beside
// forty-two initials reads as a page that failed to load — the same forty-five
// names in a list reads as a deliberate list. A threshold rather than a hardcoded
// role, so a group flips back to portraits on its own once the photos exist.
const PORTRAIT_THRESHOLD = 1 / 3

function showPortraits(group: { photo?: unknown }[]): boolean {
  if (group.length === 0) return true
  const withPhoto = group.filter((member) => Boolean(member.photo)).length
  return withPhoto / group.length >= PORTRAIT_THRESHOLD
}

/** One group of people: avatar cards, or a plain name list when portraits are scarce. */
function PeopleGroup({ members }: { members: Member[] }) {
  if (showPortraits(members)) {
    return (
      <div className="people-grid">
        {members.map((member) => (
          <PersonCard key={member.id} member={member} />
        ))}
      </div>
    )
  }
  return (
    <ul className="people-namelist">
      {members.map((member) => (
        <PersonNameRow key={member.id} member={member} />
      ))}
    </ul>
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
