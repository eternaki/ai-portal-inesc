import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// `suspended` was a third membership state nobody could define. The group's own
// site knows only current and past members, and exactly one record carried it —
// so it becomes `completed`, the closest state that is actually true of someone no
// longer listed as active. Whether that person belongs there at all is a question
// for the supervisor, like every other role decision.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "members" SET "membership_status" = 'completed' WHERE "membership_status" = 'suspended';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Which record was suspended is not recoverable from the data — restoring the
  // option in the collection config is enough to start using it again.
  await db.execute(sql`SELECT 1;`)
}
