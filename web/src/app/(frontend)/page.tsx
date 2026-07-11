import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'

// Данные приходят из CMS — рендерим на каждый запрос, не при сборке
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const payload = await getPayload({ config })

  const [publications, members] = await Promise.all([
    payload.count({ collection: 'publications' }),
    payload.count({ collection: 'members' }),
  ])

  return (
    <div>
      <h1>Machine Learning and Knowledge Discovery</h1>
      <p>
        We are a research group at INESC-ID (Lisboa) working on machine learning, data science,
        AI systems and knowledge discovery.
      </p>
      <ul>
        <li>
          <Link href="/publications">Publications</Link> — {publications.totalDocs}
        </li>
        <li>
          <Link href="/people">People</Link> — {members.totalDocs}
        </li>
      </ul>
    </div>
  )
}
