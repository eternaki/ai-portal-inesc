import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { PubRow } from '@/components/PubRow'
import type { Member, Publication } from '@/payload-types'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Research' }

export default async function ResearchPage() {
  const payload = await getPayload({ config })
  const t = await getDictionary()
  const themes = await payload.find({
    collection: 'research-themes',
    limit: 50,
    depth: 1,
  })

  return (
    <div>
      <h1>{t.research.title}</h1>
      <p className="pub-meta">{t.research.meta}</p>

      {themes.docs.length === 0 && (
        <div className="empty">
          {t.research.emptyBefore}
          <a href="/publications">{t.research.emptyLink}</a>
          {t.research.emptyAfter}
        </div>
      )}

      {themes.docs.map((theme) => {
        const members = (theme.members ?? []).filter((m): m is Member => typeof m === 'object')
        const pubs = (theme.keyPublications ?? []).filter(
          (p): p is Publication => typeof p === 'object',
        )
        return (
          <section key={theme.id} id={theme.slug ?? undefined}>
            <h2>{theme.name}</h2>
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
                <h3>{t.research.keyPublications}</h3>
                {pubs.map((p) => (
                  <PubRow key={p.id} pub={p} />
                ))}
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
