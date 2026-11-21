# Scout build plan (phases 1 to 5)

Source of truth for scope: `BUILD_PROMPT.md`. This file says how it gets built.

## Shape of the system

- One Postgres database. The web app (Next.js, Astryx) writes rows and `jobs`. The Python worker takes jobs
  with `select ... for update skip locked`, retries with `attempts + 1`, and never talks to the web app.
- Every new table lands in a new migration file, mounted by name in `docker-compose.yml`.
- Demo data: one script `worker/seed_demo.py` creates it, `worker/seed_demo.py --remove` deletes it.
  Demo rows carry `is_demo boolean`. Demo values inside a real row (birth year, height, foot on `players`)
  are named in `players.demo_fields text[]`. Screens show a "Demo" token next to any demo value.
  Events and metrics computed from them are never faked.

## Data model added

| Table / column | Phase | Purpose |
|---|---|---|
| `attributes(key, label, grp, source, metrics[], test)` | 1 | The one attribute registry, in the scout's words. Read by web and worker. |
| `requirement_profiles(id, name, org_id?, positions[], age_min?, age_max?, is_draft, note)` + `requirement_items(profile_id, attribute, priority)` | 1 | Club needs. Eight seeded. |
| `players.demo_fields text[]`, `players.height_cm` | 1 | Demo values flagged per column. |
| `player_market(player_id, contract_end, availability, transfer_conditions, representative, is_demo)` | 1/3 | Market details. |
| `scout_reports(id, player_id, org_id, author_id, recommendation, strengths, weaknesses, comments, is_demo)` + `scout_ratings(report_id, attribute, rating 1..10)` | 2 | Scout's eye. Mentality items are registry attributes in group `mental`. |
| `player_match_index(player_id, match_id, competition_id, role, minutes, index, opponent_stronger)` | 3 | Per-match index strip and stronger/weaker split. |
| `player_season_metrics.age_band, band_percentiles, band_peers` | 3 | Percentiles by U17/U19/U21/senior. |
| `players.status` (live, pending_approval, declined, withdrawn); `visible_to_scouts` becomes `generated as (status = 'live')` | 4 | One state drives visibility. |
| `org_coverage(org_id, competition_id)` | 4 | Access by coverage. |
| `saved_searches`, `agent_clients`, `profile_shares`, `intro_requests`, `report_links`, `verifications` | 4 | Workflow. |
| `squad_members`, `match_sheet_entries`, `review_events`, `match_videos`, `playlists`, `playlist_items`, `player_summaries`, `settings` | 5 | Data engine. |
| `events.source, events.confidence` | 5 | Room for AI stages; nothing built on it. |

## Event spec

`apps/web/lib/event-spec.json` is the one event spec: type, outcomes, extra fields, StatsBomb type name.
Read by the event log tool, the import validator, the exporter and the loader. Added to the twelve types:
`pressure`, `miscontrol`, `dispossessed`, `dribbled_past`, and the flags `under_pressure`, `first_time`.

## Pure functions with unit tests

- `fitScore(profile, evidence)` (web, `lib/fit.ts`): per attribute, average of the evidence that exists
  (match percentile = mean of stand-in metric percentiles; scout rating x 10; physical test percentile).
  Weighted by priority (very high 3, high 2, medium 1). Coverage = measured weight / total weight.
  Under 50% coverage: no score, "not enough evidence".
- `standouts(percentiles)`: attributes above the 85th percentile in position, top two.
- Worker metrics: new metrics in `METRICS`, ratio metrics (`*_pct`, 0..100, null under a minimum
  denominator), per-match index, age-band percentiles, xT via socceraction.
- `qualityCheck(primary, review, settings)`: count agreement and location agreement (10 units, 90%).
- `ruleFlags(events, sheet)`: outside playing time, after substitution, not on the match sheet.
- Form validation for the match sheet, scout report, market details, physical tests, import rows.

## Auth (phase 4)

Supabase-compatible, no paid service: `auth.users` gets an `encrypted_password` (pgcrypto bcrypt), and
`auth.uid()` reads `request.jwt.claims ->> 'sub'`, as Supabase does. The web app connects as `postgres`
but runs every request inside a transaction with `set local role authenticated` (or `anon`) and the
claims set, so row-level security is real. The session is an HMAC-signed cookie. With Supabase keys in
the environment, GoTrue issues the JWT and the same policies apply.

## Order of work, each unit ends in a check

1. Phase 1: loader extension and metrics (pytest) -> attribute registry and profiles migration -> fit and
   standouts (unit tests) -> demo seed -> Find by role, filters, profile sections, fit card, profile editor.
2. Phase 2: report and ratings migration -> report form (validation tests) -> Scout view and mentality chart.
3. Phase 3: match index and age bands in worker (pytest) -> xT -> risk block, market form, tests form, age curve.
4. Phase 4: auth and RLS migration -> policy audit script -> login and sign-ups -> approval and
   verification -> shortlists, saved searches, shadow team, report/print/share, agent tools, intros,
   coverage, team and competition pages.
5. Phase 5: match sheet (offline) -> upload -> import -> event log tool -> QC -> publish job -> playlists ->
   exporter -> multi-competition -> summaries -> standards pages -> Playwright.

End of each phase: deslop, no-comments, verify, qa, design-review, thermos, review; fix, commit,
`docs/build-log.md` entry.
