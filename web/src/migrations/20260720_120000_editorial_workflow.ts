import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Editorial workflow: publication review states + reviewer + decision history.
// On an existing DB, rows that predate the workflow were already live, so they
// are backfilled to 'published'; new rows default to 'pending_review'.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_publications_status" AS ENUM('imported','pending_review','approved','published','rejected','failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "status" "enum_publications_status";
    UPDATE "publications" SET "status" = 'published' WHERE "status" IS NULL;
    ALTER TABLE "publications" ALTER COLUMN "status" SET DEFAULT 'pending_review';
    ALTER TABLE "publications" ALTER COLUMN "status" SET NOT NULL;
    CREATE INDEX IF NOT EXISTS "publications_status_idx" ON "publications" ("status");

    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "review_note" varchar;

    ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "reviewer_id" integer;
    DO $$ BEGIN
      ALTER TABLE "publications" ADD CONSTRAINT "publications_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "publications_reviewer_idx" ON "publications" ("reviewer_id");

    CREATE TABLE IF NOT EXISTS "publications_review_history" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "status" varchar,
      "note" varchar,
      "reviewer" varchar,
      "at" timestamp(3) with time zone
    );
    DO $$ BEGIN
      ALTER TABLE "publications_review_history" ADD CONSTRAINT "publications_review_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "publications"("id") ON DELETE cascade;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "publications_review_history_order_idx" ON "publications_review_history" ("_order");
    CREATE INDEX IF NOT EXISTS "publications_review_history_parent_id_idx" ON "publications_review_history" ("_parent_id");

    -- AI feature flags (ai-settings global)
    ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "features_enable_chatbot" boolean DEFAULT true;
    ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "features_enable_semantic_search" boolean DEFAULT true;
    ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "features_enable_summaries" boolean DEFAULT true;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "features_enable_chatbot";
    ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "features_enable_semantic_search";
    ALTER TABLE "ai_settings" DROP COLUMN IF EXISTS "features_enable_summaries";
    DROP TABLE IF EXISTS "publications_review_history" CASCADE;
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "reviewer_id";
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "review_note";
    ALTER TABLE "publications" DROP COLUMN IF EXISTS "status";
    DROP TYPE IF EXISTS "public"."enum_publications_status";
  `)
}
