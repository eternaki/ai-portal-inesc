import React from 'react'
import Link from 'next/link'
import type { Member } from '@/payload-types'
import { avatarTone } from '@/lib/avatar-tone.mjs'
// Was a second copy of lib/member's initials(); one of the two would have drifted.
import { initials } from '@/lib/member'

// Small overlapping avatar row — used wherever a set of members should read
// as "these people", not a wall of comma-separated names (e.g. /projects).
export function MemberAvatarStack({ members, max = 6 }: { members: Member[]; max?: number }) {
  if (members.length === 0) return null
  const shown = members.slice(0, max)
  const overflow = members.length - shown.length

  return (
    <div className="avatar-stack">
      {shown.map((m) => {
        const photo = m.photo && typeof m.photo === 'object' ? m.photo : null
        const photoUrl = photo?.sizes?.thumbnail?.url || photo?.url
        return (
          <Link
            key={m.id}
            href={m.slug ? `/people/${m.slug}` : '/people'}
            className="avatar-stack-item"
            title={m.name}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" />
            ) : (
              <span className="avatar-tone" data-tone={avatarTone(m.name)}>
                {initials(m.name)}
              </span>
            )}
          </Link>
        )
      })}
      {overflow > 0 && <span className="avatar-stack-overflow">+{overflow}</span>}
    </div>
  )
}
