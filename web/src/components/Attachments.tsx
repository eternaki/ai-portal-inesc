import React from 'react'
import type { Media, Publication } from '@/payload-types'

type Attachment = NonNullable<Publication['attachments']>[number]

type Labels = {
  materials: string
  download: string
  openFile: string
  viewCode: string
  open: string
}

function isImage(m: Media | null): boolean {
  return !!m?.mimeType?.startsWith('image/')
}

function isPdf(m: Media | null): boolean {
  return m?.mimeType === 'application/pdf'
}

function mediaOf(a: Attachment): Media | null {
  return a.file && typeof a.file === 'object' ? (a.file as Media) : null
}

// Small glyph per attachment kind so non-image cards read at a glance.
const ICONS: Record<string, string> = {
  code: '{ }',
  document: '¶',
  image: '▣',
  dataset: '⋮⋮',
  file: '⭳',
  link: '↗',
}

// Every attachment renders as a uniform card: image thumbnail, embedded PDF, or
// an icon + label + typed action. Consistent size, one grid.
function AttachmentItem({ a, labels }: { a: Attachment; labels: Labels }) {
  const media = mediaOf(a)
  const href = media?.url || a.url || undefined
  if (!href) return null

  const isExternal = !media
  const action = a.kind === 'code' ? labels.viewCode : isExternal ? labels.open : labels.download

  if (media && isImage(media)) {
    return (
      <a className="attach-card attach-card-link" href={href} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.url ?? ''} alt={media.alt || a.label} loading="lazy" />
        <div className="attach-foot">
          <span className="badge">{a.kind}</span>
          <span className="attach-label">{a.label}</span>
        </div>
      </a>
    )
  }

  if (media && isPdf(media)) {
    return (
      <div className="attach-card">
        <object data={href} type="application/pdf" className="attach-pdf" aria-label={a.label} />
        <div className="attach-foot">
          <span className="badge">{a.kind}</span>
          <span className="attach-label">{a.label}</span>
          <a className="mono attach-action" href={href} target="_blank" rel="noreferrer">
            {labels.openFile} →
          </a>
        </div>
      </div>
    )
  }

  // Code repo / external link / downloadable file — same card footprint
  return (
    <a className="attach-card attach-card-link attach-card-plain" href={href} target="_blank" rel="noreferrer">
      <div className="attach-icon" aria-hidden="true">
        {ICONS[a.kind] ?? '⭳'}
      </div>
      <div className="attach-foot">
        <span className="badge">{a.kind}</span>
        <span className="attach-label">{a.label}</span>
        <span className="mono attach-action">{action} →</span>
      </div>
    </a>
  )
}

export function Attachments({
  items,
  heading,
  labels,
}: {
  items: Attachment[]
  heading: string
  labels: Labels
}) {
  if (!items || items.length === 0) return null
  return (
    <section>
      <h2>{heading}</h2>
      <div className="attach-grid">
        {items.map((a, i) => (
          <AttachmentItem key={i} a={a} labels={labels} />
        ))}
      </div>
    </section>
  )
}
