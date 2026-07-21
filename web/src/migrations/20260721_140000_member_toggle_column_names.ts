import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_o_r_c_i_d" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_d_b_l_p" boolean DEFAULT true;

    UPDATE "members"
    SET "show_o_r_c_i_d" = COALESCE("show_orcid", "show_o_r_c_i_d", true)
    WHERE EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'members' AND column_name = 'show_orcid'
    );

    UPDATE "members"
    SET "show_d_b_l_p" = COALESCE("show_dblp", "show_d_b_l_p", true)
    WHERE EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'members' AND column_name = 'show_dblp'
    );

    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_orcid";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_dblp";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_orcid" boolean DEFAULT true;
    ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "show_dblp" boolean DEFAULT true;

    UPDATE "members" SET "show_orcid" = COALESCE("show_o_r_c_i_d", "show_orcid", true);
    UPDATE "members" SET "show_dblp" = COALESCE("show_d_b_l_p", "show_dblp", true);

    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_o_r_c_i_d";
    ALTER TABLE "members" DROP COLUMN IF EXISTS "show_d_b_l_p";
  `)
}
