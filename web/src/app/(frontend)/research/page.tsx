import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { Member, Publication } from '@/payload-types'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Research' }

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

// Accent colours per theme — a quiet visual rhythm so the page reads as a
// structured set of research lines, not a list of bare headings.
const ACCENTS = ['#2553a5', '#b97a10', '#2a7f62', '#8c3fa8', '#c04b3d', '#1b7f9e']

type SearchPub = { id: number; title: string; slug?: string | null; year?: number | null }

// When a theme has no hand-picked key publications, surface the ones most
// related to it by meaning (semantic search over the group's own papers).
async function relatedByMeaning(query: string): Promise<SearchPub[]> {
  try {
    const res = await fetch(`${AI_URL}/search?q=${encodeURIComponent(query)}&limit=4`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((r: { publication: SearchPub }) => r.publication)
  } catch {
    return []
  }
}

export default async function ResearchPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const themes = await payload.find({
    collection: 'research-themes',
    limit: 50,
    depth: 1,
  })

  // Resolve publications for every theme in parallel (hand-picked, else semantic)
  const themesWithPubs = await Promise.all(
    themes.docs.map(async (theme) => {
      const picked = (theme.keyPublications ?? []).filter(
        (p): p is Publication => typeof p === 'object',
      )
      const pubs: SearchPub[] =
        picked.length > 0 ? picked : await relatedByMeaning(theme.name)
      return { theme, pubs, hand: picked.length > 0 }
    }),
  )

  return (
    <div>
      <h1>{t.research.title}</h1>
      <p className="pub-meta" style={{ maxWidth: '60ch' }}>
        {t.research.meta}
      </p>

      {themes.docs.length === 0 && (
        <div className="empty">
          {t.research.emptyBefore}
          <Link href="/publications">{t.research.emptyLink}</Link>
          {t.research.emptyAfter}
        </div>
      )}

      <div className="theme-list">
        {themesWithPubs.map(({ theme, pubs, hand }, i) => {
          const members = (theme.members ?? []).filter((m): m is Member => typeof m === 'object')
          const accent = ACCENTS[i % ACCENTS.length]
          return (
            <section
              key={theme.id}
              id={theme.slug ?? undefined}
              className="theme-card"
              style={{ borderLeftColor: accent }}
            >
              <h2 style={{ marginTop: 0 }}>{theme.name}</h2>
              {theme.description ? (
                <div className="rich-text">
                  <RichText data={theme.description} />
                </div>
              ) : null}
              {members.length > 0 && (
                <p className="pub-meta">
                  {t.research.people} {members.map((m) => m.name).join(', ')}
                </p>
              )}

              {pubs.length > 0 && (
                <>
                  <h3 style={{ color: accent }}>
                    {hand ? t.research.keyPublications : t.research.relatedPublications}
                  </h3>
                  <ul className="theme-pubs">
                    {pubs.map((p) => (
                      <li key={p.id}>
                        {p.slug ? (
                          <Link href={`/publications/${p.slug}`}>{p.title}</Link>
                        ) : (
                          p.title
                        )}
                        {p.year ? <span className="mono"> · {p.year}</span> : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
