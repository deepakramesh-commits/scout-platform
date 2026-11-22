#!/usr/bin/env bash
# Applies the auth stub and every migration not yet recorded in ops.schema_migrations, each in one transaction.
# For hosted databases (Render runs it before each deploy). Safe to re-run. The local docker compose database
# applies the same files through docker-entrypoint-initdb.d instead and has no ops schema.
# Usage: DATABASE_URL=postgres://... scripts/migrate.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL}"
q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX "$@"; }

q -c "create schema if not exists ops" \
  -c "create table if not exists ops.schema_migrations (name text primary key, applied_at timestamptz not null default now())"
applied() { [ -n "$(q -c "select 1 from ops.schema_migrations where name = '$1'")" ]; }

if ! applied 00_auth_stub.sql; then
  if [ -n "$(q -c "select 1 from pg_namespace where nspname = 'auth'")" ]; then
    echo "auth schema already exists (Supabase?): recording the stub without applying it"
    q -c "insert into ops.schema_migrations (name) values ('00_auth_stub.sql')"
  else
    # Since Postgres 16 a non-superuser who creates a role cannot SET ROLE to it without this grant,
    # and the app switches to anon or authenticated on every request.
    q -1 -f supabase/local/00_auth_stub.sql \
      -c "grant anon, authenticated to current_user" \
      -c "insert into ops.schema_migrations (name) values ('00_auth_stub.sql')"
    echo "applied 00_auth_stub.sql"
  fi
fi

for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  applied "$name" && continue
  q -1 -f "$f" -c "insert into ops.schema_migrations (name) values ('$name')"
  echo "applied $name"
done
echo "migrations up to date: $(q -c "select count(*) from ops.schema_migrations") recorded"
