import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// `thesis-topics` always modelled the full life of a thesis, not just the open
// ones — the public page simply showed a third of it under the wrong name. The
// rename makes the collection say what it holds, and moves the status vocabulary
// to the one the group already uses on its own site (New / Ongoing / Finished).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "thesis_topics" RENAME TO "dissertations";
    ALTER TABLE "thesis_topics_rels" RENAME TO "dissertations_rels";
    ALTER SEQUENCE "thesis_topics_id_seq" RENAME TO "dissertations_id_seq";
    ALTER SEQUENCE "thesis_topics_rels_id_seq" RENAME TO "dissertations_rels_id_seq";

    ALTER INDEX "thesis_topics_pkey" RENAME TO "dissertations_pkey";
    ALTER INDEX "thesis_topics_slug_idx" RENAME TO "dissertations_slug_idx";
    ALTER INDEX "thesis_topics_status_idx" RENAME TO "dissertations_status_idx";
    ALTER INDEX "thesis_topics_created_at_idx" RENAME TO "dissertations_created_at_idx";
    ALTER INDEX "thesis_topics_updated_at_idx" RENAME TO "dissertations_updated_at_idx";
    ALTER INDEX "thesis_topics_rels_pkey" RENAME TO "dissertations_rels_pkey";
    ALTER INDEX "thesis_topics_rels_order_idx" RENAME TO "dissertations_rels_order_idx";
    ALTER INDEX "thesis_topics_rels_parent_idx" RENAME TO "dissertations_rels_parent_idx";
    ALTER INDEX "thesis_topics_rels_path_idx" RENAME TO "dissertations_rels_path_idx";
    ALTER INDEX "thesis_topics_rels_members_id_idx" RENAME TO "dissertations_rels_members_id_idx";
    ALTER INDEX "thesis_topics_rels_research_themes_id_idx" RENAME TO "dissertations_rels_research_themes_id_idx";

    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "thesis_topics_rels_parent_fk" TO "dissertations_rels_parent_fk";
    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "thesis_topics_rels_members_fk" TO "dissertations_rels_members_fk";
    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "thesis_topics_rels_research_themes_fk" TO "dissertations_rels_research_themes_fk";

    ALTER TYPE "enum_thesis_topics_level" RENAME TO "enum_dissertations_level";

    ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "thesis_topics_id" TO "dissertations_id";
    ALTER TABLE "payload_locked_documents_rels" RENAME CONSTRAINT "payload_locked_documents_rels_thesis_topics_fk" TO "payload_locked_documents_rels_dissertations_fk";
    ALTER INDEX IF EXISTS "payload_locked_documents_rels_thesis_topics_id_idx" RENAME TO "payload_locked_documents_rels_dissertations_id_idx";
  `)

  // The status enum gains two labels and loses two. Postgres cannot drop enum
  // values, so build the new type and swap the column over it.
  await db.execute(sql`
    CREATE TYPE "enum_dissertations_status" AS ENUM('open', 'ongoing', 'finished');

    ALTER TABLE "dissertations" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "dissertations" ALTER COLUMN "status" TYPE "enum_dissertations_status"
      USING (
        CASE "status"::text
          WHEN 'assigned' THEN 'ongoing'
          WHEN 'completed' THEN 'finished'
          ELSE 'open'
        END
      )::"enum_dissertations_status";
    ALTER TABLE "dissertations" ALTER COLUMN "status" SET DEFAULT 'open'::"enum_dissertations_status";

    DROP TYPE "enum_thesis_topics_status";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "enum_thesis_topics_status" AS ENUM('open', 'assigned', 'completed');

    ALTER TABLE "dissertations" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "dissertations" ALTER COLUMN "status" TYPE "enum_thesis_topics_status"
      USING (
        CASE "status"::text
          WHEN 'ongoing' THEN 'assigned'
          WHEN 'finished' THEN 'completed'
          ELSE 'open'
        END
      )::"enum_thesis_topics_status";
    ALTER TABLE "dissertations" ALTER COLUMN "status" SET DEFAULT 'open'::"enum_thesis_topics_status";

    DROP TYPE "enum_dissertations_status";
  `)

  await db.execute(sql`
    ALTER INDEX IF EXISTS "payload_locked_documents_rels_dissertations_id_idx" RENAME TO "payload_locked_documents_rels_thesis_topics_id_idx";
    ALTER TABLE "payload_locked_documents_rels" RENAME CONSTRAINT "payload_locked_documents_rels_dissertations_fk" TO "payload_locked_documents_rels_thesis_topics_fk";
    ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "dissertations_id" TO "thesis_topics_id";

    ALTER TYPE "enum_dissertations_level" RENAME TO "enum_thesis_topics_level";

    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "dissertations_rels_research_themes_fk" TO "thesis_topics_rels_research_themes_fk";
    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "dissertations_rels_members_fk" TO "thesis_topics_rels_members_fk";
    ALTER TABLE "dissertations_rels" RENAME CONSTRAINT "dissertations_rels_parent_fk" TO "thesis_topics_rels_parent_fk";

    ALTER INDEX "dissertations_rels_research_themes_id_idx" RENAME TO "thesis_topics_rels_research_themes_id_idx";
    ALTER INDEX "dissertations_rels_members_id_idx" RENAME TO "thesis_topics_rels_members_id_idx";
    ALTER INDEX "dissertations_rels_path_idx" RENAME TO "thesis_topics_rels_path_idx";
    ALTER INDEX "dissertations_rels_parent_idx" RENAME TO "thesis_topics_rels_parent_idx";
    ALTER INDEX "dissertations_rels_order_idx" RENAME TO "thesis_topics_rels_order_idx";
    ALTER INDEX "dissertations_rels_pkey" RENAME TO "thesis_topics_rels_pkey";
    ALTER INDEX "dissertations_updated_at_idx" RENAME TO "thesis_topics_updated_at_idx";
    ALTER INDEX "dissertations_created_at_idx" RENAME TO "thesis_topics_created_at_idx";
    ALTER INDEX "dissertations_status_idx" RENAME TO "thesis_topics_status_idx";
    ALTER INDEX "dissertations_slug_idx" RENAME TO "thesis_topics_slug_idx";
    ALTER INDEX "dissertations_pkey" RENAME TO "thesis_topics_pkey";

    ALTER SEQUENCE "dissertations_rels_id_seq" RENAME TO "thesis_topics_rels_id_seq";
    ALTER SEQUENCE "dissertations_id_seq" RENAME TO "thesis_topics_id_seq";
    ALTER TABLE "dissertations_rels" RENAME TO "thesis_topics_rels";
    ALTER TABLE "dissertations" RENAME TO "thesis_topics";
  `)
}
