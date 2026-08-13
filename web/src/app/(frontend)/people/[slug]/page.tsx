import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { Member } from '@/payload-types'
import { JsonLd } from '@/components/JsonLd'
import { PersonLinks } from '@/components/PersonLinks'
import { PubRow } from '@/components/PubRow'
import { DissertationRow } from '@/components/DissertationRow'
import { initials, memberPhotoAlt, memberPhotoUrl, memberSameAs } from '@/lib/member'
import { published } from '@/lib/queries'
import { SITE_URL } from '@/lib/site'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

const PER_PAGE = 25

// Maps a member's role to its dictionary key. A lookup is easier to read (and to
// extend) than a nested ternary chain over the same five values.
const ROLE_KEY = {
  faculty: 'roleFaculty',
  researcher: 'roleResearchers',
  phd: 'rolePhd',
  msc: 'roleMsc',
  alumni: 'roleAlumni',
} as const

type Params = Promise<{ slug: string }>
type SearchParams = Promise<{ page?: string }>

async function findMember(slug: string): Promise<Member | null> {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'members',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] ?? null
}

export async function generateMetadata(props: { params: Params }) {
  const { slug } = await props.params
  const member = await findMember(slug)
  if (!member) return {}
  return {
    title: member.name,
    openGraph: { title: member.name, type: 'profile', url: `${SITE_URL}/people/${member.slug}` },
  }
}

export default async function PersonPage(props: { params: Params; searchParams: SearchParams }) {
  const { slug } = await props.params
  const { page } = await props.searchParams
  const t = await getDictionary()

  const member = await findMember(slug)
  if (!member) notFound()

  const payload = await getPayload({ config })
  const currentPage = Math.max(1, Number(page) || 1)

  const [publications, supervised, authored] = await Promise.all([
    payload.find({
      collection: 'publications',
      where: published({ 'authors.member': { equals: member.id } }),
      sort: '-year',
      limit: PER_PAGE,
      page: currentPage,
      depth: 1,
    }),
    payload.find({
      collection: 'dissertations',
      where: { 'supervisors.member': { equals: member.id } },
      sort: 'status',
      limit: 100,
      depth: 1,
    }),
    payload.find({
      collection: 'dissertations',
      where: { 'author.member': { equals: member.id } },
      sort: 'status',
      limit: 100,
      depth: 1,
    }),
  ])

  const photoUrl = memberPhotoUrl(member)
  const sameAs = memberSameAs(member)
  const interests = member.researchInterests ?? []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: member.name,
    ...(sameAs.length > 0 ? { sameAs } : {}),
    affiliation: { '@type': 'ResearchOrganization', name: 'MLKD, INESC-ID' },
  }

  const pageHref = (n: number) => (n > 1 ? `/people/${member.slug}?page=${n}` : `/people/${member.slug}`)

  return (
    <article>
      <JsonLd data={jsonLd} />
      <div className="article-head person-head">
        {photoUrl ? (
          <Image
            className="person-photo"
            src={photoUrl}
            alt={memberPhotoAlt(member)}
            width={120}
            height={120}
            priority
          />
        ) : (
          <div className="person-photo person-photo--initials">{initials(member.name)}</div>
        )}
        <div>
          <h1>{member.name}</h1>
          <p className="pub-meta">
            <span className="badge">{t.people[ROLE_KEY[member.role]]}</span>
            {member.membershipStatus && member.membershipStatus !== 'active' ? (
              <>
                {' '}
                <span className="badge">{t.people.statusCompleted}</span>
              </>
            ) : null}
          </p>
          {interests.length > 0 && <p className="pub-meta">{interests.join(' · ')}</p>}
          <PersonLinks member={member} emailLabel={t.people.email} websiteLabel={t.people.website} />
        </div>
      </div>

      {member.bio ? (
        <section className="rich-text">
          <RichText data={member.bio} />
        </section>
      ) : null}

      {publications.totalDocs > 0 && (
        <section>
          <h2>{t.people.publicationsHead}</h2>
          {publications.docs.map((pub) => (
            <PubRow key={pub.id} pub={pub} />
          ))}
          {publications.totalPages > 1 && (
            <nav className="pager" aria-label={t.people.publicationsHead}>
              {publications.hasPrevPage ? (
                <Link className="btn btn-quiet" href={pageHref(currentPage - 1)}>
                  {t.people.prevPage}
                </Link>
              ) : (
                <span />
              )}
              <span className="mono pager-status">
                {t.people.pageLabel} {currentPage} {t.people.pageOf} {publications.totalPages}
              </span>
              {publications.hasNextPage ? (
                <Link className="btn btn-quiet" href={pageHref(currentPage + 1)}>
                  {t.people.nextPage}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      )}

      {authored.docs.length > 0 && (
        <section>
          <h2>{t.people.authoredHead}</h2>
          {authored.docs.map((item) => (
            <DissertationRow key={item.id} item={item} />
          ))}
        </section>
      )}

      {supervised.docs.length > 0 && (
        <section>
          <h2>{t.people.supervisedHead}</h2>
          {supervised.docs.map((item) => (
            <DissertationRow key={item.id} item={item} />
          ))}
        </section>
      )}

      <p style={{ marginTop: '2.5rem' }}>
        <Link href="/people">{t.people.backToPeople}</Link>
      </p>
    </article>
  )
}
