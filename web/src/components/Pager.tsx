import React from 'react'
import Link from 'next/link'

// Which page numbers to render around the current one, with '…' for the gaps.
// Always keeps the first and last page reachable, plus one page on each side of
// the current one — so jumping from page 2 to page 11 of a 12-page list is one
// click, not ten.
function pageWindow(current: number, total: number): (number | 'ellipsis')[] {
  const delta = 1
  const middle: number[] = []
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    middle.push(i)
  }

  const pages: (number | 'ellipsis')[] = [1]
  if (middle[0] > 2) pages.push('ellipsis')
  pages.push(...middle)
  if (middle[middle.length - 1] < total - 1) pages.push('ellipsis')
  if (total > 1) pages.push(total)
  return pages
}

// Numbered pills, styled like the site's filter chips (same active/hover
// language), with arrows at each end and a small range caption underneath.
// Replaces a plain Previous/status/Next row that read as three disconnected
// pieces of text rather than a control.
export function Pager({
  currentPage,
  totalPages,
  totalDocs,
  perPage,
  hrefFor,
  labels,
}: {
  currentPage: number
  totalPages: number
  totalDocs: number
  perPage: number
  hrefFor: (page: number) => string
  labels: { previous: string; next: string; rangeOf: string; aria: string }
}) {
  if (totalPages <= 1) return null

  const first = (currentPage - 1) * perPage + 1
  const last = Math.min(currentPage * perPage, totalDocs)

  return (
    <div className="pager-wrap">
      <nav className="pager" aria-label={labels.aria}>
        {currentPage > 1 ? (
          <Link className="pager-arrow" href={hrefFor(currentPage - 1)} aria-label={labels.previous}>
            ‹
          </Link>
        ) : (
          <span className="pager-arrow is-disabled" aria-hidden="true">
            ‹
          </span>
        )}

        <div className="pager-pages">
          {pageWindow(currentPage, totalPages).map((page, index) =>
            page === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="pager-ellipsis">
                …
              </span>
            ) : (
              <Link
                key={page}
                href={hrefFor(page)}
                className={page === currentPage ? 'active' : ''}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </Link>
            ),
          )}
        </div>

        {currentPage < totalPages ? (
          <Link className="pager-arrow" href={hrefFor(currentPage + 1)} aria-label={labels.next}>
            ›
          </Link>
        ) : (
          <span className="pager-arrow is-disabled" aria-hidden="true">
            ›
          </span>
        )}
      </nav>
      <span className="mono pager-status">
        {first}–{last} {labels.rangeOf} {totalDocs}
      </span>
    </div>
  )
}
