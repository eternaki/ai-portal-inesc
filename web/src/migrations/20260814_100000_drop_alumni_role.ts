import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drop `alumni` from the members role enum.
 *
 * Role is the degree — Faculty, Researcher, PhD student, MSc student — and
 * `membershipStatus` is whether the person is still with the group. "Alumni" was
 * neither: setting it erased which degree somebody did, which is why the twelve
 * records that had it were moved back to `phd` + `completed`. Nothing has held
 * the value since (verified: 0 rows), so it is a dead option in the admin.
 *
 * Postgres cannot remove a value from an enum in place, so the type is rebuilt:
 * a new type without the value, the column swapped over, the old type dropped.
 * The column has no default to restore — `role` is required and always written.
 *
 * `down` puts the value back, so the migration is reversible even though no row
 * can use it again without an editor choosing it.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Carry the data step the rebuild depends on. Any row still on 'alumni' would
    -- make the USING cast below fail (the value is absent from the new type), which
    -- is exactly what happened when this ran against a seed that still held those
    -- twelve records. Move them to phd + completed first, so the migration is
    -- self-contained instead of assuming a hand-run cleanup already happened.
    UPDATE "members" SET "role" = 'phd', "membership_status" = 'completed'
      WHERE "role" = 'alumni';

    ALTER TYPE "public"."enum_members_role" RENAME TO "enum_members_role_old";

    CREATE TYPE "public"."enum_members_role" AS ENUM('faculty', 'researcher', 'phd', 'msc');

    ALTER TABLE "members"
      ALTER COLUMN "role" TYPE "public"."enum_members_role"
      USING "role"::text::"public"."enum_members_role";

    DROP TYPE "public"."enum_members_role_old";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_members_role" RENAME TO "enum_members_role_new";

    CREATE TYPE "public"."enum_members_role" AS ENUM('faculty', 'researcher', 'phd', 'msc', 'alumni');

    ALTER TABLE "members"
      ALTER COLUMN "role" TYPE "public"."enum_members_role"
      USING "role"::text::"public"."enum_members_role";

    DROP TYPE "public"."enum_members_role_new";
  `)
}
