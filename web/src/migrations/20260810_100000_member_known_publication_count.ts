import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Baseline count of publications a member was known to have before OpenAlex
// ingest. Nullable on purpose: an empty baseline means "unknown", and the
// coverage report skips those members rather than assuming zero.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "known_publication_count" numeric;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "members" DROP COLUMN IF EXISTS "known_publication_count";
  `)
}
