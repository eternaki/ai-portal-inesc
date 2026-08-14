import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Full publication date from OpenAlex, alongside the existing `year`. OpenAlex
// gives a day-level `publication_date` for most works but not all, so this stays
// nullable — `year` remains the reliable, required field.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "publication_date" timestamp(3) with time zone;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "publication_date";
  `)
}
