import React from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { PubRow } from '@/components/PubRow'
import type { Member, Publication } from '@/payload-types'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Research' }

export default async function ResearchPage() {
  const payload = await getPayload({ config })
  const themes = await payload.find({
    collection: 'research-themes',
    limit: 50,
    depth: 1,
  })

  return (
    <div>
      <h1>Research</h1>
      <p className="pub-meta">The thematic lines we work on, and who drives them.</p>

      {themes.docs.length === 0 && (
        <div className="empty">
          Research themes are being written up — meanwhile, browse the{' '}
          <a href="/publications">publications</a>.
        </div>
      )}

      {themes.docs.map((t) => {
        const members = (t.members ?? []).filter((m): m is Member => typeof m === 'object')
        const pubs = (t.keyPublications ?? []).filter(
          (p): p is Publication => typeof p === 'object',
        )
        return (
          <section key={t.id} id={t.slug ?? undefined}>
            <h2>{t.name}</h2>
            {t.description ? (
              <div className="rich-text">
                <RichText data={t.description} />
              </div>
            ) : null}
            {members.length > 0 && (
              <p className="pub-meta">People: {members.map((m) => m.name).join(', ')}</p>
            )}
            {pubs.length > 0 && (
              <>
                <h3>Key publications</h3>
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
