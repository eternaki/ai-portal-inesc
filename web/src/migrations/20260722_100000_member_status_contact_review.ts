import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "membership_status" varchar DEFAULT 'active' NOT NULL;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "needs_contact_review" boolean DEFAULT false;
    CREATE INDEX IF NOT EXISTS "members_membership_status_idx" ON "members" USING btree ("membership_status");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "members_membership_status_idx";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "needs_contact_review";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "membership_status";
  `)
}
