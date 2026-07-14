import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_members_role" AS ENUM('faculty', 'researcher', 'phd', 'msc', 'alumni');
  CREATE TYPE "public"."enum_publications_type" AS ENUM('journal', 'conference', 'workshop', 'book', 'preprint', 'other');
  CREATE TYPE "public"."enum_publications_ai_summary_status" AS ENUM('none', 'generated', 'edited');
  CREATE TYPE "public"."enum_projects_kind" AS ENUM('national', 'international', 'industry');
  CREATE TYPE "public"."enum_software_kind" AS ENUM('software', 'dataset');
  CREATE TYPE "public"."enum_thesis_topics_level" AS ENUM('msc', 'phd');
  CREATE TYPE "public"."enum_thesis_topics_status" AS ENUM('open', 'assigned', 'completed');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'editor', 'member');
  CREATE TABLE "members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"user_id" integer,
  	"role" "enum_members_role" NOT NULL,
  	"photo_id" integer,
  	"bio" jsonb,
  	"bio_ai_draft" varchar,
  	"orcid" varchar,
  	"openalex_id" varchar,
  	"dblp_key" varchar,
  	"links_linkedin" varchar,
  	"links_tecnico_page" varchar,
  	"links_personal_page" varchar,
  	"links_google_scholar" varchar,
  	"links_github" varchar,
  	"email" varchar,
  	"show_email" boolean DEFAULT false,
  	"career_trajectory" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "members_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "publications_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"member_id" integer
  );
  
  CREATE TABLE "publications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"year" numeric NOT NULL,
  	"type" "enum_publications_type" DEFAULT 'conference' NOT NULL,
  	"venue" varchar,
  	"abstract" varchar,
  	"doi" varchar,
  	"openalex_id" varchar,
  	"pdf_url" varchar,
  	"citation_count" numeric,
  	"verified" boolean DEFAULT false,
  	"ai_summary_tldr" varchar,
  	"ai_summary_problem" varchar,
  	"ai_summary_method" varchar,
  	"ai_summary_results" varchar,
  	"ai_summary_takeaways" varchar,
  	"ai_summary_industry" varchar,
  	"ai_summary_impact" varchar,
  	"ai_summary_status" "enum_publications_ai_summary_status" DEFAULT 'none',
  	"social_snippet" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "publications_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "research_themes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"description" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "research_themes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"members_id" integer,
  	"publications_id" integer
  );
  
  CREATE TABLE "projects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"kind" "enum_projects_kind" DEFAULT 'national',
  	"year_start" numeric,
  	"year_end" numeric,
  	"funding" varchar,
  	"url" varchar,
  	"description" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "projects_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"members_id" integer,
  	"research_themes_id" integer
  );
  
  CREATE TABLE "software" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"kind" "enum_software_kind" DEFAULT 'software' NOT NULL,
  	"description" varchar,
  	"repo_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "software_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"publications_id" integer,
  	"members_id" integer
  );
  
  CREATE TABLE "thesis_topics" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"level" "enum_thesis_topics_level" NOT NULL,
  	"status" "enum_thesis_topics_status" DEFAULT 'open' NOT NULL,
  	"description" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "thesis_topics_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"members_id" integer,
  	"research_themes_id" integer
  );
  
  CREATE TABLE "news" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar,
  	"date" timestamp(3) with time zone NOT NULL,
  	"cover_image_id" integer,
  	"body" jsonb,
  	"social_snippet" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "news_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"publications_id" integer
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'member' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"members_id" integer,
  	"publications_id" integer,
  	"research_themes_id" integer,
  	"projects_id" integer,
  	"software_id" integer,
  	"thesis_topics_id" integer,
  	"news_id" integer,
  	"media_id" integer,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "members" ADD CONSTRAINT "members_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "members_texts" ADD CONSTRAINT "members_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publications_authors" ADD CONSTRAINT "publications_authors_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "publications_authors" ADD CONSTRAINT "publications_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "publications_texts" ADD CONSTRAINT "publications_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "research_themes_rels" ADD CONSTRAINT "research_themes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."research_themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "research_themes_rels" ADD CONSTRAINT "research_themes_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "research_themes_rels" ADD CONSTRAINT "research_themes_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects_rels" ADD CONSTRAINT "projects_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects_rels" ADD CONSTRAINT "projects_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects_rels" ADD CONSTRAINT "projects_rels_research_themes_fk" FOREIGN KEY ("research_themes_id") REFERENCES "public"."research_themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "software_rels" ADD CONSTRAINT "software_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."software"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "software_rels" ADD CONSTRAINT "software_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "software_rels" ADD CONSTRAINT "software_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "thesis_topics_rels" ADD CONSTRAINT "thesis_topics_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."thesis_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "thesis_topics_rels" ADD CONSTRAINT "thesis_topics_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "thesis_topics_rels" ADD CONSTRAINT "thesis_topics_rels_research_themes_fk" FOREIGN KEY ("research_themes_id") REFERENCES "public"."research_themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "news" ADD CONSTRAINT "news_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "news_rels" ADD CONSTRAINT "news_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "news_rels" ADD CONSTRAINT "news_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_publications_fk" FOREIGN KEY ("publications_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_research_themes_fk" FOREIGN KEY ("research_themes_id") REFERENCES "public"."research_themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_projects_fk" FOREIGN KEY ("projects_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_software_fk" FOREIGN KEY ("software_id") REFERENCES "public"."software"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_thesis_topics_fk" FOREIGN KEY ("thesis_topics_id") REFERENCES "public"."thesis_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_news_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "members_slug_idx" ON "members" USING btree ("slug");
  CREATE UNIQUE INDEX "members_user_idx" ON "members" USING btree ("user_id");
  CREATE INDEX "members_role_idx" ON "members" USING btree ("role");
  CREATE INDEX "members_photo_idx" ON "members" USING btree ("photo_id");
  CREATE INDEX "members_updated_at_idx" ON "members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "members" USING btree ("created_at");
  CREATE INDEX "members_texts_order_parent" ON "members_texts" USING btree ("order","parent_id");
  CREATE INDEX "publications_authors_order_idx" ON "publications_authors" USING btree ("_order");
  CREATE INDEX "publications_authors_parent_id_idx" ON "publications_authors" USING btree ("_parent_id");
  CREATE INDEX "publications_authors_member_idx" ON "publications_authors" USING btree ("member_id");
  CREATE UNIQUE INDEX "publications_slug_idx" ON "publications" USING btree ("slug");
  CREATE INDEX "publications_year_idx" ON "publications" USING btree ("year");
  CREATE UNIQUE INDEX "publications_doi_idx" ON "publications" USING btree ("doi");
  CREATE UNIQUE INDEX "publications_openalex_id_idx" ON "publications" USING btree ("openalex_id");
  CREATE INDEX "publications_ai_summary_status_idx" ON "publications" USING btree ("ai_summary_status");
  CREATE INDEX "publications_updated_at_idx" ON "publications" USING btree ("updated_at");
  CREATE INDEX "publications_created_at_idx" ON "publications" USING btree ("created_at");
  CREATE INDEX "publications_texts_order_parent" ON "publications_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "research_themes_slug_idx" ON "research_themes" USING btree ("slug");
  CREATE INDEX "research_themes_updated_at_idx" ON "research_themes" USING btree ("updated_at");
  CREATE INDEX "research_themes_created_at_idx" ON "research_themes" USING btree ("created_at");
  CREATE INDEX "research_themes_rels_order_idx" ON "research_themes_rels" USING btree ("order");
  CREATE INDEX "research_themes_rels_parent_idx" ON "research_themes_rels" USING btree ("parent_id");
  CREATE INDEX "research_themes_rels_path_idx" ON "research_themes_rels" USING btree ("path");
  CREATE INDEX "research_themes_rels_members_id_idx" ON "research_themes_rels" USING btree ("members_id");
  CREATE INDEX "research_themes_rels_publications_id_idx" ON "research_themes_rels" USING btree ("publications_id");
  CREATE UNIQUE INDEX "projects_slug_idx" ON "projects" USING btree ("slug");
  CREATE INDEX "projects_updated_at_idx" ON "projects" USING btree ("updated_at");
  CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");
  CREATE INDEX "projects_rels_order_idx" ON "projects_rels" USING btree ("order");
  CREATE INDEX "projects_rels_parent_idx" ON "projects_rels" USING btree ("parent_id");
  CREATE INDEX "projects_rels_path_idx" ON "projects_rels" USING btree ("path");
  CREATE INDEX "projects_rels_members_id_idx" ON "projects_rels" USING btree ("members_id");
  CREATE INDEX "projects_rels_research_themes_id_idx" ON "projects_rels" USING btree ("research_themes_id");
  CREATE UNIQUE INDEX "software_slug_idx" ON "software" USING btree ("slug");
  CREATE INDEX "software_updated_at_idx" ON "software" USING btree ("updated_at");
  CREATE INDEX "software_created_at_idx" ON "software" USING btree ("created_at");
  CREATE INDEX "software_rels_order_idx" ON "software_rels" USING btree ("order");
  CREATE INDEX "software_rels_parent_idx" ON "software_rels" USING btree ("parent_id");
  CREATE INDEX "software_rels_path_idx" ON "software_rels" USING btree ("path");
  CREATE INDEX "software_rels_publications_id_idx" ON "software_rels" USING btree ("publications_id");
  CREATE INDEX "software_rels_members_id_idx" ON "software_rels" USING btree ("members_id");
  CREATE UNIQUE INDEX "thesis_topics_slug_idx" ON "thesis_topics" USING btree ("slug");
  CREATE INDEX "thesis_topics_status_idx" ON "thesis_topics" USING btree ("status");
  CREATE INDEX "thesis_topics_updated_at_idx" ON "thesis_topics" USING btree ("updated_at");
  CREATE INDEX "thesis_topics_created_at_idx" ON "thesis_topics" USING btree ("created_at");
  CREATE INDEX "thesis_topics_rels_order_idx" ON "thesis_topics_rels" USING btree ("order");
  CREATE INDEX "thesis_topics_rels_parent_idx" ON "thesis_topics_rels" USING btree ("parent_id");
  CREATE INDEX "thesis_topics_rels_path_idx" ON "thesis_topics_rels" USING btree ("path");
  CREATE INDEX "thesis_topics_rels_members_id_idx" ON "thesis_topics_rels" USING btree ("members_id");
  CREATE INDEX "thesis_topics_rels_research_themes_id_idx" ON "thesis_topics_rels" USING btree ("research_themes_id");
  CREATE UNIQUE INDEX "news_slug_idx" ON "news" USING btree ("slug");
  CREATE INDEX "news_date_idx" ON "news" USING btree ("date");
  CREATE INDEX "news_cover_image_idx" ON "news" USING btree ("cover_image_id");
  CREATE INDEX "news_updated_at_idx" ON "news" USING btree ("updated_at");
  CREATE INDEX "news_created_at_idx" ON "news" USING btree ("created_at");
  CREATE INDEX "news_rels_order_idx" ON "news_rels" USING btree ("order");
  CREATE INDEX "news_rels_parent_idx" ON "news_rels" USING btree ("parent_id");
  CREATE INDEX "news_rels_path_idx" ON "news_rels" USING btree ("path");
  CREATE INDEX "news_rels_publications_id_idx" ON "news_rels" USING btree ("publications_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_members_id_idx" ON "payload_locked_documents_rels" USING btree ("members_id");
  CREATE INDEX "payload_locked_documents_rels_publications_id_idx" ON "payload_locked_documents_rels" USING btree ("publications_id");
  CREATE INDEX "payload_locked_documents_rels_research_themes_id_idx" ON "payload_locked_documents_rels" USING btree ("research_themes_id");
  CREATE INDEX "payload_locked_documents_rels_projects_id_idx" ON "payload_locked_documents_rels" USING btree ("projects_id");
  CREATE INDEX "payload_locked_documents_rels_software_id_idx" ON "payload_locked_documents_rels" USING btree ("software_id");
  CREATE INDEX "payload_locked_documents_rels_thesis_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("thesis_topics_id");
  CREATE INDEX "payload_locked_documents_rels_news_id_idx" ON "payload_locked_documents_rels" USING btree ("news_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "members" CASCADE;
  DROP TABLE "members_texts" CASCADE;
  DROP TABLE "publications_authors" CASCADE;
  DROP TABLE "publications" CASCADE;
  DROP TABLE "publications_texts" CASCADE;
  DROP TABLE "research_themes" CASCADE;
  DROP TABLE "research_themes_rels" CASCADE;
  DROP TABLE "projects" CASCADE;
  DROP TABLE "projects_rels" CASCADE;
  DROP TABLE "software" CASCADE;
  DROP TABLE "software_rels" CASCADE;
  DROP TABLE "thesis_topics" CASCADE;
  DROP TABLE "thesis_topics_rels" CASCADE;
  DROP TABLE "news" CASCADE;
  DROP TABLE "news_rels" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_members_role";
  DROP TYPE "public"."enum_publications_type";
  DROP TYPE "public"."enum_publications_ai_summary_status";
  DROP TYPE "public"."enum_projects_kind";
  DROP TYPE "public"."enum_software_kind";
  DROP TYPE "public"."enum_thesis_topics_level";
  DROP TYPE "public"."enum_thesis_topics_status";
  DROP TYPE "public"."enum_users_role";`)
}
