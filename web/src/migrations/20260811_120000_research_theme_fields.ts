import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// /research is gone, and with it the only page that rendered a theme's members or
// its key publications. The relationship rows go too: a field an editor fills that
// appears nowhere is worse than no field.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "research_themes_rels" WHERE "path" IN ('members', 'keyPublications');
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The rows cannot be recreated — they recorded editorial choices, not derived
  // data. Restoring the fields in the collection config is enough to start
  // capturing them again.
  await db.execute(sql`SELECT 1;`)
}
