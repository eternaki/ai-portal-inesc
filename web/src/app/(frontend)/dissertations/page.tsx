import React from 'react'
import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { DissertationRow } from '@/components/DissertationRow'
import { Pager } from '@/components/Pager'
import { getDictionary } from '@/i18n/server'

// Data comes from the CMS — render on each request, not at build time
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Dissertations' }

const PER_PAGE = 25
const STAGES = ['open', 'ongoing', 'finished'] as const
const LEVELS = ['msc', 'phd'] as const

type Stage = (typeof STAGES)[number]
type Level = (typeof LEVELS)[number]
type SearchParams = Promise<{ status?: string; level?: string; page?: string }>

export default async function DissertationsPage(props: { searchParams: SearchParams }) {
  const { status, level, page } = await props.searchParams
  const payload = await getPayload({ config })
  const t = await getDictionary()

  const activeStage = STAGES.includes(status as Stage) ? (status as Stage) : undefined
  const activeLevel = LEVELS.includes(level as Level) ? (level as Level) : undefined
  const currentPage = Math.max(1, Number(page) || 1)

  const filter: Where = {}
  if (activeStage) filter.status = { equals: activeStage }
  if (activeLevel) filter.level = { equals: activeLevel }

  const result = await payload.find({
    collection: 'dissertations',
    where: filter,
    // Open topics first, then ongoing, then the archive; newest within each.
    //
    // Ascending is correct even though "finished" < "ongoing" < "open"
    // alphabetically: `status` is a Postgres enum, and enums sort by the order
    // their values were declared (open=1, ongoing=2, finished=3), not by text.
    // Reversing this to '-status' looks right on paper and puts the archive first
    // — verify against real rows, not an empty table, before touching it.
    sort: ['status', '-createdAt'],
    limit: PER_PAGE,
    page: currentPage,
    depth: 1,
  })

  const hrefWith = (patch: { status?: string | null; level?: string | null; page?: number }) => {
    const params = new URLSearchParams()
    const nextStage = patch.status === undefined ? activeStage : patch.status
    const nextLevel = patch.level === undefined ? activeLevel : patch.level
    if (nextStage) params.set('status', nextStage)
    if (nextLevel) params.set('level', nextLevel)
    if (patch.page && patch.page > 1) params.set('page', String(patch.page))
    const query = params.toString()
    return query ? `/dissertations?${query}` : '/dissertations'
  }


  return (
    <div>
      <h1>{t.dissertations.title}</h1>
      <p className="pub-meta" style={{ maxWidth: '60ch' }}>
        {t.dissertations.meta}
      </p>

      <div className="filters">
        <Link href={hrefWith({ status: null, page: 1 })} className={!activeStage ? 'active' : ''}>
          {t.dissertations.allStages}
        </Link>
        {STAGES.map((stage) => (
          <Link
            key={stage}
            href={hrefWith({ status: stage, page: 1 })}
            className={stage === activeStage ? 'active' : ''}
          >
            {t.dissertations.stages[stage]}
          </Link>
        ))}
      </div>

      <div className="filters">
        <Link href={hrefWith({ level: null, page: 1 })} className={!activeLevel ? 'active' : ''}>
          {t.dissertations.allLevels}
        </Link>
        {LEVELS.map((value) => (
          <Link
            key={value}
            href={hrefWith({ level: value, page: 1 })}
            className={value === activeLevel ? 'active' : ''}
          >
            {value === 'phd' ? 'PhD' : 'MSc'}
          </Link>
        ))}
      </div>

      {result.docs.length === 0 && <div className="empty">{t.dissertations.empty}</div>}

      {result.docs.map((item) => (
        <DissertationRow key={item.id} item={item} />
      ))}

      <Pager
        currentPage={currentPage}
        totalPages={result.totalPages}
        totalDocs={result.totalDocs}
        perPage={PER_PAGE}
        hrefFor={(page) => hrefWith({ page })}
        labels={{
          previous: t.dissertations.prevPage,
          next: t.dissertations.nextPage,
          rangeOf: t.dissertations.rangeOf,
          aria: t.dissertations.title,
        }}
      />
    </div>
  )
}
