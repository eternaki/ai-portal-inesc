import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drop the `reading-groups` collection.
 *
 * The group's reading-group log lives on the legacy site's *Events* page — one
 * entry per meeting, with the paper and who presented it — and that is the shape
 * the supervisor's site has. The 83 meetings since March 2022 were imported into
 * `events` (`web/scripts/import-events.mjs`), and the nav now links out to the
 * Técnico page that schedules them. A second collection for the same content was
 * an extra place to maintain, so it goes.
 *
 * Safe to run: the table was never populated (0 rows at the time of writing).
 * `down` recreates the schema exactly as `20260723_100000_reading_groups` did, so
 * the migration is reversible even though no data can come back with it.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "reading_groups_id";
    DROP TABLE IF EXISTS "reading_groups_rels" CASCADE;
    DROP TABLE IF EXISTS "reading_groups_materials" CASCADE;
    DROP TABLE IF EXISTS "reading_groups" CASCADE;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "reading_groups" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "slug" varchar,
      "date" timestamp(3) with time zone NOT NULL,
      "presenter" varchar,
      "paper_title" varchar,
      "description" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "reading_groups_slug_idx" ON "reading_groups" ("slug");
    CREATE INDEX IF NOT EXISTS "reading_groups_date_idx" ON "reading_groups" ("date");
    CREATE INDEX IF NOT EXISTS "reading_groups_updated_at_idx" ON "reading_groups" ("updated_at");
    CREATE INDEX IF NOT EXISTS "reading_groups_created_at_idx" ON "reading_groups" ("created_at");

    CREATE TABLE IF NOT EXISTS "reading_groups_materials" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL,
      "file_id" integer NOT NULL
    );
    DO $$ BEGIN
      ALTER TABLE "reading_groups_materials" ADD CONSTRAINT "reading_groups_materials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "reading_groups"("id") ON DELETE cascade;
      ALTER TABLE "reading_groups_materials" ADD CONSTRAINT "reading_groups_materials_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "media"("id") ON DELETE cascade;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "reading_groups_materials_order_idx" ON "reading_groups_materials" ("_order");
    CREATE INDEX IF NOT EXISTS "reading_groups_materials_parent_id_idx" ON "reading_groups_materials" ("_parent_id");
    CREATE INDEX IF NOT EXISTS "reading_groups_materials_file_idx" ON "reading_groups_materials" ("file_id");

    CREATE TABLE IF NOT EXISTS "reading_groups_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "publications_id" integer
    );
    DO $$ BEGIN
      ALTER TABLE "reading_groups_rels" ADD CONSTRAINT "reading_groups_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "reading_groups"("id") ON DELETE cascade;
      ALTER TABLE "reading_groups_rels" ADD CONSTRAINT "reading_groups_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "publications"("id") ON DELETE cascade;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "reading_groups_rels_order_idx" ON "reading_groups_rels" ("order");
    CREATE INDEX IF NOT EXISTS "reading_groups_rels_parent_idx" ON "reading_groups_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "reading_groups_rels_path_idx" ON "reading_groups_rels" ("path");
    CREATE INDEX IF NOT EXISTS "reading_groups_rels_publications_id_idx" ON "reading_groups_rels" ("publications_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "reading_groups_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reading_groups_fk" FOREIGN KEY ("reading_groups_id") REFERENCES "reading_groups"("id") ON DELETE cascade;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_reading_groups_id_idx" ON "payload_locked_documents_rels" ("reading_groups_id");
  `)
}
