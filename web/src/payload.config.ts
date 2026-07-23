import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Members } from './collections/Members'
import { Publications } from './collections/Publications'
import { ResearchThemes } from './collections/ResearchThemes'
import { Projects } from './collections/Projects'
import { Software } from './collections/Software'
import { ThesisTopics } from './collections/ThesisTopics'
import { News } from './collections/News'
import { Events } from './collections/Events'
import { ReadingGroups } from './collections/ReadingGroups'
import { AiSettings } from './globals/AiSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      // Maintenance report and admin-only RAG workbench at the top of the dashboard.
      beforeDashboard: [
        '/components/admin/HealthDashboard#HealthDashboard',
        '/components/admin/MaintenancePanel#MaintenancePanel',
        '/components/admin/RagWorkbench#RagWorkbench',
      ],
    },
  },
  collections: [
    Members,
    Publications,
    ResearchThemes,
    Projects,
    Software,
    ThesisTopics,
    News,
    Events,
    ReadingGroups,
    Media,
    Users,
  ],
  globals: [AiSettings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // Schema is applied via migrations (or the seed dump) — NOT auto-push.
    // Dev push would see the AI-owned tables (publication_embeddings, topic_map)
    // as "extra" and try to DROP them; disabling it protects that data. Opt in
    // with PAYLOAD_DB_PUSH=true on a throwaway DB if you really want push.
    push: process.env.PAYLOAD_DB_PUSH === 'true',
  }),
  sharp,
  plugins: [
    // On Vercel the filesystem is ephemeral/read-only, so uploaded media must go
    // to blob storage. Enabled only when a token is present — local dev keeps
    // using the on-disk MEDIA_DIR (see Media.ts).
    ...(process.env.BLOB_READ_WRITE_TOKEN
      ? [
          vercelBlobStorage({
            enabled: true,
            collections: { media: true },
            token: process.env.BLOB_READ_WRITE_TOKEN,
          }),
        ]
      : []),
  ],
})
