import React from 'react'
import Link from 'next/link'
import type { Member } from '@/payload-types'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .join('')
    .toUpperCase()

// Small overlapping avatar row — used wherever a set of members should read
// as "these people", not a wall of comma-separated names (e.g. /research).
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
            href={m.slug ? `/people#${m.slug}` : '/people'}
            className="avatar-stack-item"
            title={m.name}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" />
            ) : (
              <span>{initials(m.name)}</span>
            )}
          </Link>
        )
      })}
      {overflow > 0 && <span className="avatar-stack-overflow">+{overflow}</span>}
    </div>
  )
}
