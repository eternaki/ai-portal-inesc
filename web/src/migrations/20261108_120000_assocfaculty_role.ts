import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Adds the Associated Faculty member role: faculty who collaborate with MLKD but
// belong to another group, listed separately from the group's own faculty.
// Same shape as the postdoc migration — ADD VALUE is transaction-safe since
// PostgreSQL 12 as long as the new value is not used in the same transaction.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_members_role" ADD VALUE IF NOT EXISTS 'assocfaculty' AFTER 'faculty';
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Removing an enum value means rebuilding the type and every column that uses
  // it; move the rows to another role instead.
}
