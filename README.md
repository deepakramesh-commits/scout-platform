# Scout

The data and scouting platform for African football. Match video goes in, verified player statistics come out,
and clubs abroad search, compare, shortlist and request players. Start with the European buyer, work back to
the African talent.

Needs Docker, [uv](https://docs.astral.sh/uv/) (Python 3.12 is fetched automatically) and Node 22 or newer.
No paid service is needed to run it.

## Quickstart from zero

```sh
# 1. database: applies supabase/local/00_auth_stub.sql, then every migration, on a fresh volume
docker compose up -d

# 2. load StatsBomb open data (AFCON 2023). Idempotent. A tournament gets a lower minutes threshold.
#    Needs network: it downloads the open data from GitHub (about 2 minutes).
cd worker
uv run --python 3.12 python load_statsbomb.py --min-minutes 270

# 3. compute per-90 values, percentiles, attribute percentiles, xT, the per-match index and age bands
uv run --python 3.12 python metrics.py

# 4. labelled demo data (birth years, heights, contracts, tests, scout reports, one user of each type)
uv run --python 3.12 python seed_demo.py
uv run --python 3.12 pytest

# 5. the worker: takes jobs (metrics on publish, report summaries, consent deletions, exports).
#    `jobs.py --once` drains the queue and exits instead.
uv run --python 3.12 python jobs.py &

# 6. web app on http://localhost:3007
cd ../apps/web
npm ci
npm test
npm run dev -- -p 3007
```

To run the production build instead of the dev server, set a session secret. Without one, `lib/auth.ts` throws on
every request that reads the session.

```sh
npm run build
SESSION_SECRET=$(openssl rand -hex 32) npm start -- -p 3007
```

Every script reads `DATABASE_URL` and falls back to `postgres://postgres:postgres@localhost:54330/postgres`.
Remove every demo row and value with `uv run --python 3.12 python seed_demo.py --remove`.
Check that the migrations apply to an empty database with `scripts/check-fresh-db.sh`.
Run the browser tests one file at a time with `npx playwright test e2e/<file>` in `apps/web`. Playwright exits at
once when another `next dev` runs in `apps/web`, so stop that server first or set `E2E_BASE_URL=http://localhost:<port>`.

## Demo logins

Every demo account uses the password `scout-demo`.

| Email | Who |
|---|---|
| `scout@demo.scout` | Club scout, Öresund FC (demo club) |
| `scout2@demo.scout` | Club scout at a second club, to show that scout ratings stay inside their organisation |
| `agent@demo.scout` | Agent at the partner agency (demo) |
| `federation@demo.scout` | Federation that owns the competition and verifies IDs |
| `coach@demo.scout` | Academy coach |
| `player@demo.scout` | Adult player with a live profile |
| `guardian@demo.scout` | Guardian of an under-18 waiting for approval |
| `analyst@demo.scout`, `analyst2@demo.scout` | Analysts (event log and the second-analyst check) |
| `coordinator@demo.scout` | Club coordinator (match sheet) |
| `admin@demo.scout` | Our admin (approvals, coverage, accounts) |

## Optional services

Each one has a free local default and switches on when its keys are in the environment (see `.env.example`).

| Service | Default | With keys |
|---|---|---|
| Video | Files in `storage/videos`, resumable chunked upload, the browser's own player | Mux direct upload and signed playback: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE` |
| Report summaries | A plain template from the numbers | The Claude API: `ANTHROPIC_API_KEY` |
| Auth | Local password login against `auth.users`, signed cookie (`SESSION_SECRET`) | Supabase auth issues the same `sub` claim; the RLS policies are unchanged |

## Layout

- `supabase/migrations/` schema, one file per phase, each mounted by name in `docker-compose.yml`.
  `supabase/local/00_auth_stub.sql` stands in for Supabase's `auth` schema and roles.
- `worker/` Python: `load_statsbomb.py` (open data), `metrics.py` (the `METRICS` registry; the `style` vector
  size in the migrations must equal `len(KEYS)`, which a test checks), `xt.py`, `export_statsbomb.py`,
  `summaries.py`, `jobs.py`, `seed_demo.py`.
- `apps/web/` Next.js and the Astryx design system. `lib/` holds the pure, tested logic: fit score, event spec,
  quality check, import, match sheet, sign-up.
- `docs/` the technical plan, scout notes, business plan, `decisions.md` (every decision made while building),
  `build-log.md` (what each phase delivered and what is still open), `import-csv.md`.

Coordinates are StatsBomb's 120 by 80 pitch, attacking toward x = 120. For open data `events.video_seconds` is the
match clock; for logged matches it is the video time, and the analyst marks where each period starts.
