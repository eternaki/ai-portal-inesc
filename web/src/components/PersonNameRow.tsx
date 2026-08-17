import React from 'react'
import Link from 'next/link'
import type { Member } from '@/payload-types'
import { visibleLinks } from '@/lib/member'

// A person as one line, for groups the portraits have not reached — currently the
// students who joined after the group's old team page was last edited.
//
// It carries the same two things the card does, the profile link and LinkedIn, so
// nothing is lost by dropping the avatar; only the empty circle goes. Same
// overlay-link structure as PersonCard, because LinkedIn is a real anchor and
// must not be nested inside another one.
export function PersonNameRow({ member }: { member: Member }) {
  const linkedin = visibleLinks(member).find((link) => link.label === 'LinkedIn')

  return (
    <li className="person-row">
      {member.slug ? (
        <Link className="person-row-link" href={`/people/${member.slug}`}>
          {member.name}
        </Link>
      ) : (
        <strong>{member.name}</strong>
      )}
      {linkedin && (
        <a
          className="person-row-external"
          href={linkedin.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${member.name} — LinkedIn`}
        >
          in
        </a>
      )}
    </li>
  )
}
