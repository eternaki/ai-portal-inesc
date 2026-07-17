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

// Preview + link for one attachment: image thumbnail, embedded PDF, or a typed
// link for code/datasets/files. External URLs (e.g. GitHub) render as links.
function AttachmentItem({ a, labels }: { a: Attachment; labels: Labels }) {
  const media = mediaOf(a)
  const href = media?.url || a.url || undefined
  if (!href) return null

  if (media && isImage(media)) {
    return (
      <figure className="attach-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.url ?? ''} alt={media.alt || a.label} loading="lazy" />
        <figcaption>
          <span className="badge">{a.kind}</span> {a.label}{' '}
          <a className="mono" href={href} target="_blank" rel="noreferrer">
            {labels.open}
          </a>
        </figcaption>
      </figure>
    )
  }

  if (media && isPdf(media)) {
    return (
      <div className="attach-card">
        <object data={href} type="application/pdf" className="attach-pdf" aria-label={a.label}>
          <p className="pub-meta">{a.label}</p>
        </object>
        <div className="attach-foot">
          <span className="badge">{a.kind}</span> {a.label}{' '}
          <a className="mono" href={href} target="_blank" rel="noreferrer">
            {labels.openFile}
          </a>
        </div>
      </div>
    )
  }

  // Code repo / external link / downloadable file
  const isExternal = !media
  const linkLabel = a.kind === 'code' ? labels.viewCode : isExternal ? labels.open : labels.download
  return (
    <div className="attach-row">
      <span className="badge">{a.kind}</span>
      <span className="attach-label">{a.label}</span>
      <a className="mono" href={href} target="_blank" rel="noreferrer">
        {linkLabel} →
      </a>
    </div>
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
