import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" ALTER COLUMN "alt" DROP NOT NULL;

    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "original_url" varchar;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_publications_attachments_kind" AS ENUM('code','document','image','dataset','file','link');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "publications_attachments" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL,
      "kind" "enum_publications_attachments_kind" DEFAULT 'file' NOT NULL,
      "file_id" integer,
      "url" varchar
    );
    DO $$ BEGIN
      ALTER TABLE "publications_attachments" ADD CONSTRAINT "publications_attachments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "publications"("id") ON DELETE cascade;
      ALTER TABLE "publications_attachments" ADD CONSTRAINT "publications_attachments_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "media"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "publications_attachments_order_idx" ON "publications_attachments" ("_order");
    CREATE INDEX IF NOT EXISTS "publications_attachments_parent_id_idx" ON "publications_attachments" ("_parent_id");
    CREATE INDEX IF NOT EXISTS "publications_attachments_file_idx" ON "publications_attachments" ("file_id");

    CREATE TABLE IF NOT EXISTS "events" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "slug" varchar,
      "date" timestamp(3) with time zone NOT NULL,
      "location" varchar,
      "speaker" varchar,
      "description" jsonb,
      "link" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "events_slug_idx" ON "events" ("slug");
    CREATE INDEX IF NOT EXISTS "events_date_idx" ON "events" ("date");
    CREATE INDEX IF NOT EXISTS "events_updated_at_idx" ON "events" ("updated_at");
    CREATE INDEX IF NOT EXISTS "events_created_at_idx" ON "events" ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "events_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "events"("id") ON DELETE cascade;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" ("events_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "publications_attachments" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_publications_attachments_kind";
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "original_url";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "events_id";
    DROP TABLE IF EXISTS "events" CASCADE;
  `)
}
