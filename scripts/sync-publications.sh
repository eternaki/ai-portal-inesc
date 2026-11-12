#!/usr/bin/env bash
#
# Pull new publications from OpenAlex and make them searchable.
#
#   ./scripts/sync-publications.sh
#
# Run on the server, from the repository directory, with the stack up. Safe to run
# as often as you like; meant for a weekly cron entry (docs/OPERATIONS.md).
#
# Whose papers: every active member with an OpenAlex ID on their profile — editors
# maintain that in the admin, not in a file. New papers arrive as pending_review
# drafts; nothing is published without an editor.
#
# Why three steps and not one: the publish hook in the admin only embeds a paper
# that has no summary yet, and ingested papers arrive with one. Without the embed
# steps a paper an editor publishes stays out of search, the map and the chatbot
# until someone remembers to run them.
#
set -euo pipefail

AI_SERVICE="${AI_SERVICE:-ai}"
run_ai() { docker compose exec -T "$AI_SERVICE" python -m "$@"; }

echo "==> $(date -Is) 1/3 ingest from OpenAlex"
run_ai app.pipelines.ingest

echo "==> $(date -Is) 2/3 publication embeddings + topic map"
run_ai app.pipelines.embed

echo "==> $(date -Is) 3/3 cross-type embeddings (search, chatbot)"
run_ai app.pipelines.embed_entities

echo "==> $(date -Is) done"
