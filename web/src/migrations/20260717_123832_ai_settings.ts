import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ai_settings_llm_model" AS ENUM('', 'groq/llama-3.3-70b-versatile', 'groq/llama-3.1-8b-instant', 'gemini/gemini-flash-lite-latest', 'gemini/gemini-flash-latest', 'mistral/mistral-small-latest', 'cerebras/gpt-oss-120b');
  CREATE TABLE "ai_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"llm_model" "enum_ai_settings_llm_model" DEFAULT '',
  	"custom_model" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "ai_settings" CASCADE;
  DROP TYPE "public"."enum_ai_settings_llm_model";`)
}
