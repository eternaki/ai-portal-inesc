import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Adds the PostDoc member role (requested by Prof. Arlindo: the people page must
// distinguish current/past postdoctoral researchers from PhD/MSc students).
// ALTER TYPE ... ADD VALUE is transaction-safe since PostgreSQL 12 as long as the
// new value is not used in the same transaction — and it is not.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_members_role" ADD VALUE IF NOT EXISTS 'postdoc' BEFORE 'phd';
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Removing an enum value requires rebuilding the type and every column using
  // it; not worth it for a rollback nobody will run. Rows can simply be moved to
  // another role first.
}
