import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_members_identifiers_confidence" AS ENUM('high', 'medium', 'low');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "ciencia_id" varchar;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "tecnico_id" varchar;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_linked_in" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_git_hub" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_orcid" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_ciencia_id" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_dblp" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_tecnico_page" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_personal_page" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_google_scholar" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "contacts_source" varchar;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "contacts_verified_at" timestamp(3) with time zone;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "identifiers_verified" boolean DEFAULT false;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "identifiers_confidence" "public"."enum_members_identifiers_confidence";
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "identifiers_source" varchar;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "identifiers_verified_at" timestamp(3) with time zone;

    CREATE UNIQUE INDEX IF NOT EXISTS "members_orcid_unique_idx"
      ON "members" USING btree ("orcid") WHERE "orcid" IS NOT NULL AND "orcid" <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS "members_ciencia_id_unique_idx"
      ON "members" USING btree ("ciencia_id") WHERE "ciencia_id" IS NOT NULL AND "ciencia_id" <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS "members_openalex_id_unique_idx"
      ON "members" USING btree ("openalex_id") WHERE "openalex_id" IS NOT NULL AND "openalex_id" <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS "members_dblp_key_unique_idx"
      ON "members" USING btree ("dblp_key") WHERE "dblp_key" IS NOT NULL AND "dblp_key" <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS "members_tecnico_id_unique_idx"
      ON "members" USING btree ("tecnico_id") WHERE "tecnico_id" IS NOT NULL AND "tecnico_id" <> '';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "members_tecnico_id_unique_idx";
    DROP INDEX IF EXISTS "members_dblp_key_unique_idx";
    DROP INDEX IF EXISTS "members_openalex_id_unique_idx";
    DROP INDEX IF EXISTS "members_ciencia_id_unique_idx";
    DROP INDEX IF EXISTS "members_orcid_unique_idx";

    ALTER TABLE "members" DROP COLUMN IF EXISTS "identifiers_verified_at";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "identifiers_source";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "identifiers_confidence";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "identifiers_verified";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "contacts_verified_at";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "contacts_source";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_google_scholar";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_personal_page";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_tecnico_page";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_dblp";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_ciencia_id";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_orcid";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_git_hub";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_linked_in";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "tecnico_id";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "ciencia_id";
    DROP TYPE IF EXISTS "public"."enum_members_identifiers_confidence";
  `)
}
