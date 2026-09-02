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

## The photos

Uploads are files, not rows, so no database dump contains them. There are two
ways to get them onto a server, and the first needs no transfer at all.

**Re-fetch them.** All 59 member photographs came from the group's own team page
in the first place, and `photos:import:apply` — already a step in `data:setup` —
downloads them again:

```bash
docker compose exec web pnpm photos:import:apply
```

**Or copy the archive.** `media-2026-09-02.tar.gz` holds the 59 photographs plus
the resized copies Payload generates:

```bash
docker compose exec -T web tar xzf - -C /app/media < db/dumps/media-2026-09-02.tar.gz
```

Keep the archive even if you re-fetch. This portal replaces the site the photos
are fetched from; the day that host is retired, the import has nowhere to read
from and the archive is the only copy left.

Two rows, `fig.png` and `model.py`, are seed fixtures whose files have never
existed anywhere — attachments on a demo publication. They are not in the archive
and nothing is missing because of it.

## The alternative, which needs no dump at all

Everything above is reproducible from the sources on a server running current
`main`:

```bash
docker compose exec web pnpm data:setup
```

Fifteen idempotent steps against the *current* schema, so there is no staleness
to correct afterwards. Prefer this unless you specifically want this snapshot.
