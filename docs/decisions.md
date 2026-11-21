# Decision record

One row per decision made for the user while building, append-only. A wrong call gets a new row that
supersedes it.

| ts | phase | decision | why | evidence | result |
|---|---|---|---|---|---|
| 2026-11-21T12:30Z | setup | Ran `git init` and committed the code as received before changing anything | The prompt asks for a commit per verified unit; the baseline makes every later diff reviewable | commit 1a60f5a | baseline: 4 pytest, build and astryx doctor green |
| 2026-11-21T12:40Z | plan | Wrote docs/build-plan.md and had an independent agent run plan-eng-review and plan-design-review on it | The prompt requires both reviews before the plan is final | docs/build-plan.md | 12 eng findings, design rated 3/10 for missing states and navigation |
| 2026-11-21T12:50Z | plan | Accepted: open-data matches load as published and metrics read only published matches | "Only published matches feed profiles"; without it every AFCON match looked unpublished | worker/load_statsbomb.py, worker/metrics.py `load_competition` | done |
| 2026-11-21T12:50Z | plan | Accepted: the loader no longer writes `visible_to_scouts` | A re-run must never bring back a profile hidden by consent or approval | worker/load_statsbomb.py | done |
| 2026-11-21T12:50Z | plan | Rejected the reviewer's fixed 16-key style vector; the vector grows with METRICS (33) | The prompt says the vector size must equal len(METRICS); a test now enforces it | worker/test_metrics.py `test_style_vector_size_in_migrations_matches_keys` | done |
| 2026-11-21T12:50Z | plan | Attribute evidence from match data is a real percentile: the worker ranks the mean of the stand-in metric percentiles within the position | A plain average of percentiles squeezes toward 50, which would make "above the 85th" far rarer than it says | worker/metrics.py `attribute_percentiles` | tested |
| 2026-11-21T12:50Z | plan | Standouts in small position groups are shown with a "ranked among only N" note, not hidden | Hiding them under 10 peers would remove every standout from wingers and midfielders in AFCON | lib/fit.ts `standouts`, profile UI | done |
| 2026-11-21T12:50Z | plan | The minutes needed for percentiles is `competitions.min_minutes` (AFCON 270, default 450) | The rule differs by competition, and more than one competition must work | supabase/migrations/20261121000000_phase1_scouting.sql | done |
| 2026-11-21T12:55Z | 1 | Loaded Block and Goal Keeper events and an `aerial_won` flag as well as the four required types | They close data-spec gaps (blocks, saves, crosses claimed, aerial duels) at almost no cost | worker/load_statsbomb.py | done |
| 2026-11-21T12:55Z | 1 | Shares (pass accuracy, dribble, tackle, first touch under pressure) are `*_pct` keys in the per-90 JSON, 0 to 100, empty under a minimum number of attempts | One registry and one JSON keep the pages unchanged; the suffix tells the web app to label them as shares | worker/metrics.py `RATIOS` | tested |
| 2026-11-21T12:55Z | 1 | First touch under pressure = receptions under pressure minus miscontrols under pressure, over receptions under pressure | The open data has no "kept the ball" flag; this is the closest honest stand-in, so the attribute is "partly match data" | worker/metrics.py | weak stand-in, listed in build log |
| 2026-11-21T12:55Z | 1 | Long pass = 32 pitch units or more | Roughly 30 m on the StatsBomb pitch, which is measured in yards | worker/metrics.py `LONG_PASS` | done |
| 2026-11-21T13:00Z | 1 | Fit weights: very high 3, high 2, medium 1. Scout rating x 10 gives the 0 to 100 scale. A physical test counts as a third kind of evidence (percentile among tested players) | The registry names physical tests as the source for speed and acceleration; without them those attributes could only be rated by eye | apps/web/lib/fit.ts | tested |
| 2026-11-21T13:00Z | 1 | The five general profiles get no priorities from the notes, so the first two listed attributes are very high and the rest high, and each profile says so | Simplest reading that still ranks; the Malmö FF full-back and wide midfielder are all high as instructed | migration requirement_profiles notes | done |
| 2026-11-21T13:00Z | 1 | Web unit tests run on Node's own test runner (`npm test`) | Node 26 runs .ts natively; no new dependency | apps/web/package.json | 5 pass |
