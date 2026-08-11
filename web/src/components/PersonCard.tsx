import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Member } from '@/payload-types'
import { initials, memberPhotoAlt, memberPhotoUrl } from '@/lib/member'

// Identification only: a photo, a name, a level. Everything else lives on the
// person's own page — the card carrying each member's links and bibliography is
// what turned a list of 113 people into a wall you had to read rather than scan.
export function PersonCard({ member, roleBadge }: { member: Member; roleBadge?: string }) {
  const photoUrl = memberPhotoUrl(member)

  const body = (
    <>
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
    </>
  )

  // A member with no slug has no address to link to; render the card inert rather
  // than pointing at a URL that 404s.
  if (!member.slug) return <div className="person-card">{body}</div>

  return (
    <Link className="person-card" href={`/people/${member.slug}`}>
      {body}
    </Link>
  )
}
