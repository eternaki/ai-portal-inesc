#!/usr/bin/env bash
#
# Pull new publications from OpenAlex and make them searchable.
#
#   ./scripts/sync-publications.sh --dry-run   # report what would change, write nothing
#   ./scripts/sync-publications.sh             # do it
#
# Run on the server, from the repository directory, with the stack up. Read
# docs/PUBLICATION-SYNC.md before the first run: it covers the backup, the
# prerequisites and what to check afterwards.
#
# Whose papers: every active member with an OpenAlex ID on their profile — editors
# maintain that in the admin, not in a file. New papers arrive as pending_review
# drafts; nothing is published without an editor. Papers already on the site get
# citation counts, abstracts and links refreshed; never their status, summary or
# author list.
#
# Why three steps and not one: the publish hook in the admin only embeds a paper
# that has no summary yet, and ingested papers arrive with one. Without the embed
# steps a paper an editor publishes stays out of search, the map and the chatbot.
#
# Safe to re-run. Stops at the first failing step (set -e); the ingest refuses to
# start without a working PAYLOAD_API_KEY.
#
set -euo pipefail

AI_SERVICE="${AI_SERVICE:-ai}"
run_ai() { docker compose exec -T "$AI_SERVICE" python -m "$@"; }

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "==> $(date -Is) dry run: nothing is written"
  run_ai app.pipelines.ingest --dry-run
  exit 0
fi

echo "==> $(date -Is) 1/3 ingest from OpenAlex"
run_ai app.pipelines.ingest

echo "==> $(date -Is) 2/3 publication embeddings + topic map"
run_ai app.pipelines.embed

echo "==> $(date -Is) 3/3 cross-type embeddings (search, chatbot)"
run_ai app.pipelines.embed_entities

echo "==> $(date -Is) done"
