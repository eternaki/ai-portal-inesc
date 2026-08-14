import React from 'react'
import Link from 'next/link'

// The same eighteen lines of JSX sat in the publications list, the dissertations
// list and the person page — same classes, same empty-span placeholders, same
// off-by-one arithmetic for the range. Three copies is where a layout change gets
// applied twice and forgotten once.
//
// The empty spans matter: they hold the grid so "Older →" does not slide to the
// middle on the first page, where there is no "Newer".
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

  const first = totalDocs === 0 ? 0 : (currentPage - 1) * perPage + 1
  const last = Math.min(currentPage * perPage, totalDocs)

  return (
    <nav className="pager" aria-label={labels.aria}>
      {currentPage > 1 ? (
        <Link className="btn btn-quiet" href={hrefFor(currentPage - 1)}>
          {labels.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="mono pager-status">
        {first}–{last} {labels.rangeOf} {totalDocs}
      </span>
      {currentPage < totalPages ? (
        <Link className="btn btn-quiet" href={hrefFor(currentPage + 1)}>
          {labels.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
