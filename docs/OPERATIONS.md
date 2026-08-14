# MLKD Portal Operations

Short operational guide for maintaining the local or deployed MLKD portal.

## Local Setup

From the repository root:

```powershell
scripts\local-setup.bat
```

Useful variants:

```powershell
scripts\local-setup.bat --start-web
scripts\local-setup.bat --start-ai
scripts\local-setup.bat --reset-db
```

The setup restores the local seed when needed, runs Payload migrations, imports the curated member data and links publication authors to member profiles.

**After restoring the seed, run `pnpm seed:prune:apply` in `web/`.** The dump carries
two dissertations invented during early development, presented on the public page as
open for application — a student can apply to a topic that does not exist. The prune
removes them and is safe to re-run: it deletes by exact title and refuses when a
title matches more than one record. The seeded news item is left in place on purpose,
as the only example of how a post renders on the home page.

## Main Admin Tasks

- Add or edit members in `/admin/collections/members`.
- Upload member photos through the `photo` field. If no photo is uploaded, the public site shows initials.
- Add publications through the admin import panel or the `publications` collection.
- Review AI-generated summaries before treating them as public-facing content.
- Add reading-group meetings in `/admin/collections/events` (see below).

## Reading Groups

Reading-group meetings are **events**, not a collection of their own — that is how
the group's own site has always listed them, and one collection is one place to
maintain. Add a meeting in `/admin/collections/events`:

- `title`: the paper discussed.
- `date`: meeting date.
- `speaker`: who presented it.
- `link`: the paper (arXiv, DOI, publisher page).

They appear on `/events` with the rest. The nav's *Reading Groups* entry is an
external link to the Técnico page that schedules the sessions.

The archive since March 2022 was imported from the legacy site with
`pnpm events:import` (dry run) / `pnpm events:import:apply`. Both are idempotent —
a meeting is matched on title *and* date — so re-running only refreshes.

## Chatbot And AI

The site can run without an LLM provider. Public content, CMS editing and normal pages remain available.

Check AI readiness:

```text
/api/health/admin
```

For the chatbot, configure one provider in the backend environment. Gemini is the preferred free cloud provider; OpenRouter is the fallback provider when configured.

Do not put API keys in frontend environment variables.

## Data Health

Use the admin dashboard:

- System health
- Data health
- Admin RAG

Recommended checks before a demo:

- Database is ready.
- AI service is reachable.
- LLM/chatbot is ready or explicitly marked as not configured.
- Published publications have embeddings.
- Members and publications are populated.
- Publication authors are linked to member profiles.

## Validation Commands

```powershell
npm.cmd --prefix web run generate:types
npm.cmd --prefix web run typecheck
npm.cmd --prefix web run build
npm.cmd --prefix web run members:import:test
```

For Python validation:

```powershell
docker compose exec ai python -m unittest discover -s tests
docker compose exec ai python -m compileall app tests
```

## Deployment Notes

- Run migrations before using new collections.
- Configure persistent media storage for uploads.
- Keep `PAYLOAD_SECRET`, database credentials and LLM keys server-side only.
- Do not deploy public default admin credentials.
- Use the admin health dashboard after deployment.

## Regular Maintenance

1. Pull latest `main`.
2. Run migrations.
3. Run the local setup/import commands if refreshing data.
4. Check `/people`, `/publications`, `/search`, `/events` and `/admin`.
5. Review the admin health dashboard.
