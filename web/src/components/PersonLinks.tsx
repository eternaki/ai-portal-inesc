import React from 'react'
import type { Member } from '@/payload-types'
import { personalPageUrl, visibleLinks } from '@/lib/member'

// The labels of external services (LinkedIn, ORCID, …) are proper nouns and stay
// untranslated; only "Website" and "Email" are ours to word, so they arrive as props.
export function PersonLinks({
  member,
  emailLabel,
  websiteLabel,
}: {
  member: Member
  emailLabel: string
  websiteLabel: string
}) {
  const links = visibleLinks(member)
  const personal = personalPageUrl(member)
  const email = member.showEmail && member.email ? member.email : null

  // No early return for the fully-empty case: the People page today always
  // renders this row (CSS gives it `margin-top`, so an empty div still reserves
  // its own vertical gap under the card content). Short-circuiting to null would
  // collapse that gap for the handful of members with no visible contact info at
  // all, which is a pixel change the extraction is not allowed to make.
  return (
    <div className="person-links">
      {links.map((link) => (
        <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      ))}
      {personal && (
        <a href={personal} target="_blank" rel="noreferrer">
          {websiteLabel}
        </a>
      )}
      {email && <a href={`mailto:${email}`}>{emailLabel}</a>}
    </div>
  )
}
