import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Member } from '@/payload-types'
import { initials, memberPhotoAlt, memberPhotoUrl, visibleLinks } from '@/lib/member'

// A portrait, then the name. The group's 59 photographs are the most human thing
// on the site and they were being used as 64px icons beside a line of text, which
// turned 114 people into thirty-eight rows of identical boxes — a list you read
// rather than a group you recognise. The picture is now the card.
//
// Everything else still lives on the person's page. LinkedIn stays as a corner
// mark because it is the one link a visitor wants straight from the wall; it is a
// real anchor sitting above the card's overlay link, so the card is a positioned
// block rather than a <Link> wrapping everything — links must not nest.
export function PersonCard({ member }: { member: Member }) {
  const photoUrl = memberPhotoUrl(member)
  const linkedin = visibleLinks(member).find((link) => link.label === 'LinkedIn')

  return (
    <div className="person-card">
      <div className="person-portrait">
        {photoUrl ? (
          <Image
            className="person-avatar person-avatar--photo"
            src={photoUrl}
            alt={memberPhotoAlt(member)}
            width={200}
            height={200}
            sizes="(max-width: 640px) 40vw, 180px"
            loading="lazy"
          />
        ) : (
          <div className="person-avatar">{initials(member.name)}</div>
        )}

        {linkedin && (
          <a
            className="person-card-linkedin"
            href={linkedin.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`LinkedIn — ${member.name}`}
            title="LinkedIn"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.65h.05c.53-.95 1.83-1.95 3.76-1.95 4.02 0 4.76 2.5 4.76 5.76V21h-4v-5.66c0-1.35-.03-3.09-1.96-3.09-1.96 0-2.26 1.47-2.26 2.99V21h-4V9Z"
              />
            </svg>
          </a>
        )}
      </div>

      {/* A member with no slug has no address to link to; the name stays plain
          text rather than pointing at a URL that 404s. */}
      {member.slug ? (
        <Link className="person-card-link" href={`/people/${member.slug}`}>
          {member.name}
        </Link>
      ) : (
        <strong className="person-card-link">{member.name}</strong>
      )}
    </div>
  )
}
