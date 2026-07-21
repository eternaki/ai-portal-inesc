import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Adds the next summary fields and lightweight generation metadata. These remain
// editable/simple in Payload while keeping enough traceability for maintenance.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "ai_summary_contributions" varchar;
    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "ai_summary_topics" varchar;
    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "ai_summary_model" varchar;
    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "ai_summary_prompt_version" varchar;
    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "ai_summary_generated_at" timestamp(3) with time zone;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "ai_summary_contributions";
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "ai_summary_topics";
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "ai_summary_model";
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "ai_summary_prompt_version";
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "ai_summary_generated_at";
  `)
}
