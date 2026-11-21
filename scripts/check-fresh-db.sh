#!/usr/bin/env bash
# Applies every init file mounted in docker-compose.yml to a throwaway database, in order, and fails on the first error.
# Usage: scripts/check-fresh-db.sh [--keep]   (--keep leaves it running on port 54331)
set -euo pipefail
cd "$(dirname "$0")/.."
name=scout-fresh-check
docker rm -f "$name" >/dev/null 2>&1 || true
mounts=()
while read -r src dst; do mounts+=(-v "$PWD/${src#./}:$dst:ro"); done < <(
  grep -E '^\s+- \./supabase/.+docker-entrypoint-initdb\.d' docker-compose.yml | sed -E 's/^ +- //; s/:ro$//; s/:/ /')
docker run -d --name "$name" -p 54331:5432 -e POSTGRES_PASSWORD=postgres "${mounts[@]}" pgvector/pgvector:pg16 >/dev/null
for _ in $(seq 60); do
  if docker logs "$name" 2>&1 | grep -q "PostgreSQL init process complete"; then break; fi
  if docker logs "$name" 2>&1 | grep -qE "ERROR|FATAL"; then break; fi
  sleep 1
done
if docker logs "$name" 2>&1 | grep -E "ERROR|FATAL" ; then docker logs "$name" 2>&1 | grep -B2 -A3 ERROR | head -30; docker rm -f "$name" >/dev/null; exit 1; fi
echo "fresh database: $(( ${#mounts[@]} / 2 )) init files applied"
[ "${1:-}" = "--keep" ] || docker rm -f "$name" >/dev/null
