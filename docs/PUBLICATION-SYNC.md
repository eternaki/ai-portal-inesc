# Publication sync — bulk import from OpenAlex

How to pull the group's publications from OpenAlex into the site **without
damaging what is already there**. Read it once end to end before the first run on
production; after that, steps 2–4 and 6 are the routine.

Script: [`scripts/sync-publications.sh`](../scripts/sync-publications.sh).
Pipeline: [`ai/app/pipelines/ingest.py`](../ai/app/pipelines/ingest.py) (the same
one that filled the site the first time; only where it gets its author list from
has changed).

---

## What it does — and what it never does

The script runs three steps inside the `ai` container:

1. **`ingest`** — for every **active** member whose profile has an **OpenAlex ID**,
   fetch all of their works from OpenAlex.
   - A paper not on the site yet is **created as a `pending_review` draft**, with an
     extractive (LLM-free) summary. It is **not public** until an editor publishes it.
   - A paper already on the site (matched by OpenAlex ID, then DOI — including
     drafts and `rejected` duplicates) only gets these refreshed: citation count,
     abstract, venue, PDF / original link, referenced works.
2. **`embed`** — embeddings + topic map for the *published* papers.
3. **`embed_entities`** — embeddings for the cross-type search and the chatbot.

It **never**:

- publishes anything, or changes a paper's `status`;
- touches a summary (generated or human-edited);
- rewrites a paper's **author list** or its links to member profiles;
- deletes anything;
- touches members, news, photos or any other collection.

Re-running it is safe: the second run finds everything the first one created.

---

## 1. Prerequisites (check once)

| Check | How | Why it matters |
|---|---|---|
| Server runs a `main` that includes this script | `git log --oneline -1`, then `docker compose up -d --build` after pulling | Older code overwrites author lists on re-import (see "History" below) |
| **`PAYLOAD_API_KEY`** is set in `.env` | Admin → Users → the service user (role `editor`) → *Enable API Key* → copy into `.env` → `docker compose up -d ai` | **Critical.** Without it Payload shows the importer only *published* papers, so every draft and every parked duplicate looks new and is created again. The ingest now refuses to start without a working key (exit code 2), but check it anyway. |
| `OPENALEX_MAILTO` is a real address in `.env` | | OpenAlex's "polite pool": faster and fewer refusals |
| Active members have their **OpenAlex ID** filled in | Admin → Members → *OpenAlex ID* (only admins/editors can edit it) | Only these people are followed. Today very few members have one. |

### Finding someone's OpenAlex ID — carefully

1. Search the person on <https://openalex.org> → *Authors*.
2. Open the profile and **check it really is them**: affiliation (INESC-ID / IST /
   Técnico), topics, a few paper titles you recognise. Common names have several
   OpenAlex profiles.
3. Copy the `A…` part of the URL (or the whole URL — it is accepted) into the
   member's **OpenAlex ID** field.

A wrong ID is the main way to break things: it imports a stranger's entire
publication list as drafts. The dry run (step 3) is where you catch it.

Only **active** members are followed: OpenAlex follows a person, not their
affiliation, so a former member's later papers would keep arriving. To stop
following someone, set their *Membership status* to *Completed*.

---

## 2. Back up the database

Always, right before a run:

```bash
cd ~/mlkd-portal
mkdir -p backups
docker compose exec -T db pg_dump -U mlkd mlkd | gzip > backups/before-sync-$(date +%F-%H%M).sql.gz
ls -lh backups/ | tail -1        # must not be a few bytes
```

Photos are not touched by the sync, so no media backup is needed for it.

---

## 3. Dry run — read before writing

```bash
./scripts/sync-publications.sh --dry-run
```

Nothing is written. The output lists who is followed and every paper that **would
be created**, then a total:

```
INFO following 12 active member(s) with an OpenAlex ID
INFO fetching works for Arlindo L. Oliveira (A5041559313)
INFO would create: Some new paper title (2026)
...
INFO done: 7 would be created, 219 would be refreshed, 226 unique works
```

**Stop and investigate** if:

- `skipped <name>: OpenAlex ID is not an author id ... or another member has it`
  — fix that member's field; the others still run.
- **"would be created" is large** on a site that already has its papers (dozens
  rather than a handful). Usual causes: a wrong OpenAlex ID (someone else's papers
  — read the listed titles), or a newly added member with a long history (expected,
  but then plan the review in step 6).
- `PAYLOAD_API_KEY is missing or not accepted` / `cannot reach Payload` — fix the
  prerequisite; nothing was touched.

---

## 4. Run it

```bash
./scripts/sync-publications.sh
```

Takes minutes (OpenAlex pagination is throttled on purpose; the embedding steps
load a model). It stops at the first failing step. Ends with
`done: N created, M updated, …` from the ingest and `==> … done`.

Exit codes, for whoever automates it: `0` ok · `1` no member has an OpenAlex ID ·
`2` Payload unreachable or the key is not accepted · anything else: a step failed,
read the output.

---

## 5. Link authors to profiles, merge duplicates

The ingest links a paper's authors to profiles only for the members it followed.
Co-authors who are members but were not followed (no OpenAlex ID yet) are linked
by the linker scripts. OpenAlex also indexes some papers twice (preprint +
proceedings, IEEE + ACM record); the dedupe merges them. Both scripts are
dry-run first, apply second, and write a report under `web/reports/`:

```bash
docker compose exec web pnpm publications:link-members          # dry run
docker compose exec web pnpm publications:link-members:apply
docker compose exec web pnpm authors:link-aliases:apply
docker compose exec web pnpm publications:dedupe                # dry run — read the pairs
docker compose exec web pnpm publications:dedupe:apply
```

Order matters: dedupe **last**, once the papers are in.

> These are the commands the README documents for the containerised stack. The
> production `web` image is a Next.js standalone build; if `pnpm` there reports a
> missing script or config, run the same commands from a checkout on the server
> (`cd web && pnpm install`) with `DATABASE_URL=postgresql://mlkd:<password>@127.0.0.1:5432/mlkd`
> and the `PAYLOAD_SECRET` from `.env`. Not yet verified on the production image.

---

## 6. Editorial review

New papers are drafts. In the admin: **Publications** → filter *Status* =
*Pending review*.

- Belongs to the group → **publish**.
- Does not (wrong person, not a research output) → set *Status* to **rejected**.

**Never delete** an unwanted imported paper. The ingest recognises papers by the
rows that exist; a deleted one is simply created again on the next run.
`rejected` keeps the row and hides it from every public page.

### Then refresh search

Embeddings are computed for **published** papers only, and publishing an imported
paper in the admin does **not** embed it (the save hook only processes papers that
have no summary yet; imported ones arrive with one). After a review round:

```bash
docker compose exec -T ai python -m app.pipelines.embed
docker compose exec -T ai python -m app.pipelines.embed_entities
```

(or wait for the next sync, which runs both). Until then the newly published
papers are on `/publications` but not in search, on `/map` or in the chatbot.

---

## 7. Check the site

```bash
docker compose exec db psql -U mlkd mlkd -c \
  "SELECT status, count(*) FROM publications GROUP BY 1 ORDER BY 1;"
```

Then in the browser: `/publications`, a couple of `/people/<slug>` profiles (their
paper lists should not have shrunk), `/search` for a new paper's topic, and the
admin dashboard → *Data health* (*Missing embeddings* should be 0 after step 6).

---

## 8. If something went wrong

- **Unwanted drafts** (wrong ID, stranger's papers): nothing public changed. Fix
  the member's OpenAlex ID, then select the drafts in the admin and set them to
  *rejected* (not delete — see step 6).
- **Published content damaged** (should not happen with this script — if it does,
  stop and report it): restore the backup from step 2. This undoes **everything**
  done on the site since that backup, admin edits included — only do it right
  away:

  ```bash
  docker compose stop web ai
  docker compose exec -T db psql -U mlkd -d mlkd -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  gunzip -c backups/before-sync-<stamp>.sql.gz | docker compose exec -T db psql -U mlkd -d mlkd -v ON_ERROR_STOP=1 -q
  docker compose start web ai
  ```

  Restoring your *own* fresh backup this way is fine. Restoring a dump from another
  machine is not — that goes through `scripts/prod-restore.sh`.

---

## Don'ts

- Don't run it without the key check passing — it refuses, don't work around it.
- Don't delete imported papers; reject them.
- Don't paste an OpenAlex ID you have not checked belongs to that person.
- Don't follow former members (keep them *Completed*).
- Don't run two syncs at the same time.
- Don't run `pnpm data:setup` on production as a "refresh" — it is the first-time
  setup chain and re-runs every importer.

## Scheduling

The script is non-interactive (`docker compose exec -T`), idempotent and returns
meaningful exit codes, so it can be scheduled (e.g. weekly). Scheduling is **not
set up** in this repository; whoever sets it up should keep step 2 (backup) before
it and step 6 (review + embed) as a human routine.

## History — why the guards exist

- **Author lists were overwritten on every re-import.** The incoming list links
  only the members a run follows, so it replaced every other member link and
  papers disappeared from profile pages. A re-import no longer writes `authors`
  (`payload_api._REFRESHABLE`).
- **Deleted duplicates came back.** Twenty-six merged papers were re-created
  within a month because they had been deleted. Hence *reject, don't delete*.
- **A run without a key re-creates drafts.** Hence the `whoami` check before the
  ingest writes anything.
