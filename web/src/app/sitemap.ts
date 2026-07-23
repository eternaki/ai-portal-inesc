import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { SITE_URL } from '@/lib/site'
import { PUBLISHED } from '@/lib/queries'

// The sitemap is built from the CMS on each request
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config })

  const [pubs, news] = await Promise.all([
    payload.find({
      collection: 'publications',
      where: PUBLISHED,
      limit: 2000,
      depth: 0,
      select: { slug: true, updatedAt: true },
    }),
    payload.find({
      collection: 'news',
      limit: 500,
      depth: 0,
      select: { slug: true, updatedAt: true },
    }),
  ])

  const statics: MetadataRoute.Sitemap = [
    '',
    '/publications',
    '/people',
    '/research',
    '/projects',
    '/software',
    '/opportunities',
    '/reading-groups',
    '/news',
    '/search',
  ].map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: 'weekly' as const }))

  return [
    ...statics,
    ...pubs.docs
      .filter((d) => d.slug)
      .map((d) => ({
        url: `${SITE_URL}/publications/${d.slug}`,
        lastModified: d.updatedAt ? new Date(d.updatedAt) : undefined,
        changeFrequency: 'monthly' as const,
      })),
    ...news.docs
      .filter((d) => d.slug)
      .map((d) => ({
        url: `${SITE_URL}/news/${d.slug}`,
        lastModified: d.updatedAt ? new Date(d.updatedAt) : undefined,
        changeFrequency: 'yearly' as const,
      })),
  ]
}
