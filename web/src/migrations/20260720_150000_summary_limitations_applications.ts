import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Adds the aiSummary.limitations / aiSummary.applications fields (added with the
// RAG summarization workflow). They previously relied on dev schema push; with
// push disabled by default, they need an explicit migration for prod/seed DBs.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "ai_summary_limitations" varchar;
    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "ai_summary_applications" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "ai_summary_limitations";
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "ai_summary_applications";
  `)
}
