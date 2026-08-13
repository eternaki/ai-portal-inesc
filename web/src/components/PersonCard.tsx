import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Member } from '@/payload-types'
import { initials, memberPhotoAlt, memberPhotoUrl, visibleLinks } from '@/lib/member'

// Identification, plus the one shortcut worth duplicating. The card used to carry
// every link and a bibliography, which turned a list of 113 people into a wall you
// had to read rather than scan; everything else still lives on the person's page.
//
// LinkedIn is the exception: 92 of 113 members have one and it is the link a
// visitor actually wants from a list of names, so it sits on the card as well as
// on the profile. It is a real anchor inside the card's own link, so it must not
// be nested inside one — hence the card is a positioned block with an overlay
// link rather than a <Link> wrapping everything.
export function PersonCard({ member }: { member: Member }) {
  const photoUrl = memberPhotoUrl(member)
  const linkedin = visibleLinks(member).find((link) => link.label === 'LinkedIn')

  return (
    <div className="person-card">
      {photoUrl ? (
        <Image
          className="person-avatar person-avatar--photo"
          src={photoUrl}
          alt={memberPhotoAlt(member)}
          width={64}
          height={64}
          loading="lazy"
        />
      ) : (
        <div className="person-avatar">{initials(member.name)}</div>
      )}

      <div className="person-card-body">
        {/* A member with no slug has no address to link to; the name stays plain
            text rather than pointing at a URL that 404s. */}
        {member.slug ? (
          <Link className="person-card-link" href={`/people/${member.slug}`}>
            {member.name}
          </Link>
        ) : (
          <strong>{member.name}</strong>
        )}
      </div>

      {linkedin && (
        <a
          className="person-card-linkedin"
          href={linkedin.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`LinkedIn — ${member.name}`}
          title="LinkedIn"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.65h.05c.53-.95 1.83-1.95 3.76-1.95 4.02 0 4.76 2.5 4.76 5.76V21h-4v-5.66c0-1.35-.03-3.09-1.96-3.09-1.96 0-2.26 1.47-2.26 2.99V21h-4V9Z"
            />
          </svg>
        </a>
      )}
    </div>
  )
}
