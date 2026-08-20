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

// The exact taxonomy Prof. Arlindo asked for: Faculty, then each cohort split
// into current and past members. Faculty keeps a single heading (a professor
// who leaves is a rarity, and "Current Faculty" would read oddly); every other
// role renders as two sections. Empty sections disappear rather than showing
// an empty heading — "Current PostDocs" exists in the taxonomy but is empty today.
const ROLE_ORDER = [
  { value: 'faculty', currentKey: 'roleFaculty', pastKey: 'rolePastFaculty' },
  { value: 'researcher', currentKey: 'roleResearchers', pastKey: 'rolePastResearchers' },
  { value: 'postdoc', currentKey: 'rolePostdoc', pastKey: 'rolePastPostdoc' },
  { value: 'phd', currentKey: 'rolePhd', pastKey: 'rolePastPhd' },
  { value: 'msc', currentKey: 'roleMsc', pastKey: 'rolePastMsc' },
] as const

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

      {ROLE_ORDER.map(({ value, currentKey, pastKey }) => {
        const current = result.docs.filter(
          (member) => member.role === value && (member.membershipStatus ?? 'active') === 'active',
        )
        const past = result.docs.filter(
          (member) => member.role === value && member.membershipStatus === 'completed',
        )
        if (current.length === 0 && past.length === 0) return null
        return (
          <React.Fragment key={value}>
            {current.length > 0 && (
              <section>
                <h2>{t.people[currentKey]}</h2>
                <PeopleGroup members={current} />
              </section>
            )}
            {past.length > 0 && (
              <section>
                <h2>{t.people[pastKey]}</h2>
                <PeopleGroup members={past} />
              </section>
            )}
          </React.Fragment>
        )
      })}

      {result.docs.length === 0 && <div className="empty">{t.people.empty}</div>}
    </div>
  )
}
