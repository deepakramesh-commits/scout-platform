#!/usr/bin/env bash
# Runs the job worker and the web app in one container: both read and write STORAGE_DIR, and a Render disk
# attaches to a single service. If either process exits, the container exits and Render restarts it.
set -euo pipefail
(cd /app/worker && exec .venv/bin/python jobs.py) &
(cd /app/apps/web && exec node_modules/.bin/next start -p "${PORT:-3000}") &
wait -n
