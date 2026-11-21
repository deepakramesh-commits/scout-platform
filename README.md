# Scout platform: weeks 1-2 foundation

Postgres + pgvector schema, StatsBomb open data (Africa Cup of Nations 2023), per-90 metrics, percentiles, style vectors, and a scout search page.

Needs Docker, [uv](https://docs.astral.sh/uv/) (Python 3.12 is fetched automatically) and Node 20+.

## Quickstart

```sh
# 1. database (applies supabase/local/00_auth_stub.sql then the migration on a fresh volume)
docker compose up -d

# 2. load StatsBomb open data (idempotent; defaults to AFCON 2023, --competition-id 1267 --season-id 107)
cd worker
uv run --python 3.12 python load_statsbomb.py

# 3. compute metrics. AFCON is a tournament, so use 270 minutes instead of the default 450
uv run --python 3.12 python metrics.py --min-minutes 270
uv run --python 3.12 pytest

# 4. web app on http://localhost:3007
cd ../apps/web
npm install
npm run dev -- -p 3007
```

The database listens on host port 54330. Scripts and the web app read `DATABASE_URL` (see `.env.example`) and fall back to that same URL. They connect as the `postgres` superuser, which bypasses RLS; that is expected for this scaffold.

## Layout

- `supabase/migrations/` schema. `supabase/local/00_auth_stub.sql` is a local stand-in for Supabase's `auth` schema.
- `worker/metrics.py` holds the `METRICS` registry. The `style` vector size (16) in the migration must equal `len(METRICS)`.
- Metric labels are derived from the keys in `apps/web/lib/metrics.ts`; there is no label table.
- Coordinates are StatsBomb's 120 x 80 pitch, each team attacking toward x = 120. `events.video_seconds` is the match clock until real video exists.
