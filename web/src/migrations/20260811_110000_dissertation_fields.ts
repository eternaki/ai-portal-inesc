import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Fields the legacy site carries that this collection never had: who supervised,
// who wrote it, what a student needs to apply, and where the defended thesis lives.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "author_name" varchar;
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "author_member_id" integer;
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "requisites" jsonb;
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "fenix_url" varchar;
    ALTER TABLE "dissertations" ADD COLUMN IF NOT EXISTS "source_url" varchar;

    DO $$ BEGIN
      ALTER TABLE "dissertations" ADD CONSTRAINT "dissertations_author_member_id_members_id_fk"
        FOREIGN KEY ("author_member_id") REFERENCES "members"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "dissertations_author_member_idx" ON "dissertations" ("author_member_id");

    CREATE TABLE IF NOT EXISTS "dissertations_supervisors" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "member_id" integer
    );
    DO $$ BEGIN
      ALTER TABLE "dissertations_supervisors" ADD CONSTRAINT "dissertations_supervisors_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "dissertations"("id") ON DELETE cascade;
      ALTER TABLE "dissertations_supervisors" ADD CONSTRAINT "dissertations_supervisors_member_id_members_id_fk"
        FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "dissertations_supervisors_order_idx" ON "dissertations_supervisors" ("_order");
    CREATE INDEX IF NOT EXISTS "dissertations_supervisors_parent_id_idx" ON "dissertations_supervisors" ("_parent_id");
    CREATE INDEX IF NOT EXISTS "dissertations_supervisors_member_idx" ON "dissertations_supervisors" ("member_id");

    DELETE FROM "dissertations_rels" WHERE "path" = 'advisors';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "dissertations_supervisors" CASCADE;
    DROP INDEX IF EXISTS "dissertations_author_member_idx";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "source_url";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "fenix_url";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "requisites";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "author_member_id";
    ALTER TABLE "dissertations" DROP COLUMN IF EXISTS "author_name";
  `)
}
