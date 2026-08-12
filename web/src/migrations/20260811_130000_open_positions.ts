import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Paid research jobs. No relationship fields, so there is no companion _rels table
// — only the collection's own table plus the usual locked-documents column.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_open_positions_kind" AS ENUM('phd', 'postdoc', 'researcher', 'internship');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "enum_open_positions_status" AS ENUM('open', 'closed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "open_positions" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "slug" varchar,
      "kind" "enum_open_positions_kind" DEFAULT 'phd' NOT NULL,
      "status" "enum_open_positions_status" DEFAULT 'open' NOT NULL,
      "deadline" timestamp(3) with time zone,
      "apply_url" varchar,
      "description" jsonb,
      "contact_email" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "open_positions_slug_idx" ON "open_positions" ("slug");
    CREATE INDEX IF NOT EXISTS "open_positions_status_idx" ON "open_positions" ("status");
    CREATE INDEX IF NOT EXISTS "open_positions_updated_at_idx" ON "open_positions" ("updated_at");
    CREATE INDEX IF NOT EXISTS "open_positions_created_at_idx" ON "open_positions" ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "open_positions_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_open_positions_fk"
        FOREIGN KEY ("open_positions_id") REFERENCES "open_positions"("id") ON DELETE cascade;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_open_positions_id_idx" ON "payload_locked_documents_rels" ("open_positions_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "open_positions_id";
    DROP TABLE IF EXISTS "open_positions" CASCADE;
    DROP TYPE IF EXISTS "enum_open_positions_status";
    DROP TYPE IF EXISTS "enum_open_positions_kind";
  `)
}
