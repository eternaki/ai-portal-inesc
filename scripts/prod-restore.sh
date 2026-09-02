#!/usr/bin/env bash
#
# Replace the production database with a dump, keeping what only production has.
#
#   ./scripts/prod-restore.sh mlkd-corrected.sql.gz            # plan only
#   PROD_RESTORE_APPLY=1 ./scripts/prod-restore.sh dump.sql.gz # do it
#
# Run on the server, from the repository directory, with the stack up.
#
# A plain `psql < dump` would be wrong here. The dump replaces every table, and
# two of them hold things that exist only on production:
#
#   users             the admin accounts. Restoring the dump's copy locks the team
#                     out and installs whoever the dump's admin was.
#   publications      the AI summaries, written there by the summarise pipeline.
#
# Both are carried across a restore in a schema the dump does not touch, then put
# back. Publications are re-matched on `openalex_id` (falling back to `doi`),
# never on `id`: row ids are assigned per database and do not agree between them.
#
# Media is NOT in the database — uploads are files under /app/media. Copy that
# volume separately or the avatars 404:
#   docker compose exec -T web tar czf - -C /app/media . > media.tar.gz
#
set -euo pipefail

DUMP="${1:-}"
APPLY="${PROD_RESTORE_APPLY:-0}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${POSTGRES_USER:-mlkd}"
DB_NAME="${POSTGRES_DB:-mlkd}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "usage: $0 <dump.sql.gz>   (file not found: '${DUMP:-}')" >&2
  exit 2
fi

psql_q() { docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }
psql_f() { docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q; }

echo "==> Production now"
printf '    publications      %s\n' "$(psql_q 'SELECT count(*) FROM publications')"
printf '    with a summary    %s\n' "$(psql_q "SELECT count(*) FROM publications WHERE ai_summary_status IS NOT NULL AND ai_summary_status <> 'none'")"
printf '    members           %s\n' "$(psql_q 'SELECT count(*) FROM members')"
printf '    events            %s\n' "$(psql_q 'SELECT count(*) FROM events')"
printf '    users             %s\n' "$(psql_q 'SELECT count(*) FROM users')"

echo "==> Incoming dump"
printf '    publications      %s\n' "$(gunzip -c "$DUMP" | awk '/^COPY public\.publications /{f=1;next} f&&/^\\.$/{print n;exit} f{n++}')"
printf '    members           %s\n' "$(gunzip -c "$DUMP" | awk '/^COPY public\.members /{f=1;next} f&&/^\\.$/{print n;exit} f{n++}')"
printf '    events            %s\n' "$(gunzip -c "$DUMP" | awk '/^COPY public\.events /{f=1;next} f&&/^\\.$/{print n;exit} f{n++}')"

if [[ "$APPLY" != "1" ]]; then
  echo
  echo "Plan (nothing written):"
  echo "  1. back up production to backup-$STAMP.sql.gz"
  echo "  2. copy users + publication summaries into schema \"carryover\""
  echo "  3. drop schema public, restore the dump"
  echo "  4. put users and summaries back, matched on openalex_id/doi"
  echo
  echo "Re-run with PROD_RESTORE_APPLY=1 to do it."
  exit 0
fi

echo "==> 1/4  Backing up production"
docker compose exec -T "$DB_SERVICE" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "backup-$STAMP.sql.gz"
echo "    backup-$STAMP.sql.gz ($(du -h "backup-$STAMP.sql.gz" | cut -f1))"

echo "==> 2/4  Stashing what only production has"
# The summary column list is read from the catalogue rather than written out, so
# this keeps working when the schema gains or loses one.
psql_f <<'SQL'
DROP SCHEMA IF EXISTS carryover CASCADE;
CREATE SCHEMA carryover;

-- Same text treatment as the summaries: the users table has an enum `role`,
-- and the schema drop below would take that column out of the copy.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(
           CASE WHEN data_type = 'USER-DEFINED'
                THEN format('%I::text AS %I', column_name, column_name)
                ELSE format('%I', column_name) END,
           ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users';
  EXECUTE format('CREATE TABLE carryover.users AS SELECT %s FROM public.users', cols);
END $$;

-- Enum columns are stored as text on purpose. `DROP SCHEMA public CASCADE`
-- below drops the enum *type* too, and that cascade would take any column
-- depending on it — including the copy in here. ai_summary_status vanished
-- from the stash exactly that way the first time this ran.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(
           CASE WHEN data_type = 'USER-DEFINED'
                THEN format('%I::text AS %I', column_name, column_name)
                ELSE format('%I', column_name) END,
           ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'publications'
    AND column_name LIKE 'ai\_summary%';

  IF cols IS NULL THEN
    RAISE EXCEPTION 'no ai_summary columns found — wrong database?';
  END IF;

  EXECUTE format(
    'CREATE TABLE carryover.summaries AS
       SELECT openalex_id, doi, %s FROM public.publications
       WHERE ai_summary_status IS NOT NULL AND ai_summary_status <> ''none''', cols);
END $$;
SQL
echo "    users:     $(psql_q 'SELECT count(*) FROM carryover.users')"
echo "    summaries: $(psql_q 'SELECT count(*) FROM carryover.summaries')"

echo "==> 3/4  Restoring the dump"
psql_f <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
SQL
gunzip -c "$DUMP" | docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q
echo "    restored"

echo "==> 4/4  Putting production's own data back"
psql_f <<'SQL'
-- Summaries first: match on openalex_id, then on doi for the rows that lack one.
DO $$
DECLARE assigns text; matched int;
BEGIN
  -- Cast back into the enum the stash kept as text.
  SELECT string_agg(
           CASE WHEN data_type = 'USER-DEFINED'
                THEN format('%1$I = c.%1$I::%2$s', column_name, format('%I.%I', udt_schema, udt_name))
                ELSE format('%1$I = c.%1$I', column_name) END,
           ', ' ORDER BY ordinal_position)
    INTO assigns
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'publications'
    AND column_name LIKE 'ai\_summary%';

  EXECUTE format(
    'UPDATE public.publications p SET %s FROM carryover.summaries c
      WHERE p.openalex_id IS NOT NULL AND p.openalex_id = c.openalex_id', assigns);
  GET DIAGNOSTICS matched = ROW_COUNT;
  RAISE NOTICE 'summaries restored by openalex_id: %', matched;

  EXECUTE format(
    'UPDATE public.publications p SET %s FROM carryover.summaries c
      WHERE p.doi IS NOT NULL AND p.doi = c.doi
        AND (p.ai_summary_status IS NULL OR p.ai_summary_status = ''none'')', assigns);
  GET DIAGNOSTICS matched = ROW_COUNT;
  RAISE NOTICE 'summaries restored by doi: %', matched;
END $$;

-- Then the accounts. Added, never swapped: `members.user_id` and the payload
-- session/preference tables reference users, so emptying the table first takes
-- them with it — a TRUNCATE ... CASCADE here wiped members, publications and
-- dissertations in testing, seconds after restoring them. Existing rows are left
-- alone and only emails production had that the dump lacks are inserted, so
-- nobody loses their way into the admin and nothing else is touched.
DO $$
DECLARE cols text; inserted int;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name <> 'id';

  EXECUTE format(
    'INSERT INTO public.users (%1$s)
       SELECT %2$s FROM carryover.users c
        WHERE NOT EXISTS (SELECT 1 FROM public.users u
                           WHERE lower(u.email) = lower(c.email))',
    cols,
    (SELECT string_agg(
       CASE WHEN data_type = 'USER-DEFINED'
            THEN format('c.%1$I::%2$s', column_name, format('%I.%I', udt_schema, udt_name))
            ELSE format('c.%I', column_name) END,
       ', ' ORDER BY ordinal_position)
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name <> 'id'));
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RAISE NOTICE 'accounts carried over from production: %', inserted;
END $$;

SELECT setval(pg_get_serial_sequence('public.users', 'id'),
              GREATEST((SELECT max(id) FROM public.users), 1));
SQL

echo "==> Result"
printf '    publications      %s\n' "$(psql_q 'SELECT count(*) FROM publications')"
printf '    with a summary    %s\n' "$(psql_q "SELECT count(*) FROM publications WHERE ai_summary_status IS NOT NULL AND ai_summary_status <> 'none'")"
printf '    members           %s\n' "$(psql_q 'SELECT count(*) FROM members')"
printf '    events            %s\n' "$(psql_q 'SELECT count(*) FROM events')"
printf '    users             %s\n' "$(psql_q 'SELECT count(*) FROM users')"
unplaced="$(psql_q 'SELECT count(*) FROM carryover.summaries c WHERE NOT EXISTS (SELECT 1 FROM publications p WHERE p.openalex_id = c.openalex_id)')"
echo
echo "    $unplaced summary/summaries had no publication in the dump to attach to."
echo "    Expected when the dump has had its duplicates merged: those rows are the"
echo "    copies that were removed, and the surviving twin keeps its own summary."
echo "    They are still readable in carryover.summaries; check before dropping it:"
echo "      SELECT openalex_id, ai_summary_tldr FROM carryover.summaries c"
echo "       WHERE NOT EXISTS (SELECT 1 FROM publications p WHERE p.openalex_id = c.openalex_id);"
echo "      DROP SCHEMA carryover CASCADE;"
echo "    Restart the app so it reconnects: docker compose restart web ai"
