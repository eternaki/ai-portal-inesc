# Hand-over dumps

A snapshot of the corrected content, for whoever has access to the server. This
is **not** the seed: `db/seed/mlkd-seed.sql.gz` is what a fresh `docker compose
up` loads automatically, and it must stay migration-current for everyone. These
files are one-off hand-overs and can be deleted once applied.

## mlkd-2026-09-02-corrected.sql.gz

The state after the August data work: 226 publications (26 OpenAlex duplicates
merged), 114 members with their names, degrees and membership reconciled against
the supervisor's rosters and the group's own team page, the 83-meeting
reading-group archive, 58 dissertations, the three research themes the mission
statement names.

**Taken from a database at 18 migrations; the code is now at 20.** Restoring it
alone leaves the schema behind the code and every page 500s — `publication_date`
simply is not there. `scripts/prod-restore.sh` runs `payload migrate` as its last
step for that reason. Verified: restore → migrate → 20 migrations, all data
intact.

Apply it with the script, never with a bare `psql`, or the server loses its admin
accounts and its AI summaries:

```bash
PROD_RESTORE_APPLY=1 ./scripts/prod-restore.sh db/dumps/mlkd-2026-09-02-corrected.sql.gz
```

Media is not in here — uploads are files. Copy `/app/media` separately, or every
avatar 404s.

## The alternative, which needs no dump at all

Everything above is reproducible from the sources on a server running current
`main`:

```bash
docker compose exec web pnpm data:setup
```

Fifteen idempotent steps against the *current* schema, so there is no staleness
to correct afterwards. Prefer this unless you specifically want this snapshot.
