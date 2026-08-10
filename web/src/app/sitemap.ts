import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { SITE_URL } from '@/lib/site'
import { PUBLISHED } from '@/lib/queries'

// The sitemap is built from the CMS on each request
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config })

  const [pubs, news, projects, software] = await Promise.all([
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
    payload.count({ collection: 'projects' }),
    payload.count({ collection: 'software' }),
  ])

  // Sections that exist as routes but hold no content yet are left out: submitting
  // an empty page to a search engine earns a thin-content result, not a visitor.
  const statics: MetadataRoute.Sitemap = [
    '',
    '/publications',
    '/people',
    '/research',
    '/map',
    '/opportunities',
    '/news',
    '/events',
    '/reading-groups',
    '/search',
    ...(projects.totalDocs > 0 ? ['/projects'] : []),
    ...(software.totalDocs > 0 ? ['/software'] : []),
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
