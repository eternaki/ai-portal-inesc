import type { Media, Member } from '@/payload-types'

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .join('')
    .toUpperCase()

// A field is shown only when it holds a value AND its toggle is not explicitly
// off. The toggles default to true, so `undefined` must read as visible.
const visible = (value: unknown, toggle?: boolean | null) => Boolean(value) && toggle !== false

const visibleValue = (value?: string | null, toggle?: boolean | null) =>
  visible(value, toggle) ? value : null

function memberPhoto(member: Member): Media | null {
  return member.photo && typeof member.photo === 'object' ? member.photo : null
}

export function memberPhotoUrl(member: Member): string | null {
  const photo = memberPhoto(member)
  return photo?.sizes?.thumbnail?.url || photo?.url || null
}

export function memberPhotoAlt(member: Member): string {
  return memberPhoto(member)?.alt || member.name
}

/** Every externally visible profile link, in the order the site shows them. */
export function visibleLinks(member: Member): { label: string; href: string }[] {
  const entries: ({ label: string; href: string | null | undefined } | null)[] = [
    { label: 'LinkedIn', href: visibleValue(member.links?.linkedin, member.showLinkedIn) },
    { label: 'GitHub', href: visibleValue(member.links?.github, member.showGitHub) },
    {
      label: 'ORCID',
      href: visible(member.orcid, member.showORCID) ? `https://orcid.org/${member.orcid}` : null,
    },
    {
      label: 'Ciencia Vitae',
      href: visible(member.cienciaId, member.showCienciaId)
        ? `https://www.cienciavitae.pt/${member.cienciaId}`
        : null,
    },
    {
      label: 'DBLP',
      href: visible(member.dblpKey, member.showDBLP) ? `https://dblp.org/pid/${member.dblpKey}` : null,
    },
    { label: 'Tecnico', href: visibleValue(member.links?.tecnicoPage, member.showTecnicoPage) },
    { label: 'Google Scholar', href: visibleValue(member.links?.googleScholar, member.showGoogleScholar) },
  ]

  return entries.filter((e): e is { label: string; href: string } => Boolean(e?.href))
}

/** schema.org sameAs: the same links, plus the personal page. */
export function memberSameAs(member: Member): string[] {
  const personal = visibleValue(member.links?.personalPage, member.showPersonalPage)
  return [...visibleLinks(member).map((l) => l.href), ...(personal ? [personal] : [])]
}

export function personalPageUrl(member: Member): string | null {
  return visibleValue(member.links?.personalPage, member.showPersonalPage) ?? null
}
