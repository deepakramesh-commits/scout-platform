# Build log

One entry per phase: what was built, what could not be measured, where a stand-in metric is weak, and the
decisions made for you. Every decision has a row in `docs/decisions.md`.

## Phase 1: buyer-first scouting

**Built.**
- **Attribute registry.** 30 attributes in the scout's own words, grouped technical, physical, tactical and
  mental. Each carries its source and stand-in metrics, and lives in Postgres (`attributes`), where both the web
  app and the worker read it.
- **Worker metrics.** Up from 16 to 33: goals, assists, first-time shots, shots on target, long passes,
  pressures, through balls received, receptions in the box, blocks, aerial duels won, ball losses, saves and
  crosses claimed. Four shares join them: pass accuracy, dribble success, tackle success and first touch under
  pressure.
- **Loader.** It now keeps pressure, miscontrol, dispossessed, dribbled-past, block and goalkeeper events, plus
  the under-pressure, first-time, aerial-won and set-piece flags and which players started. There are 160,230
  events, up from 138,775.
- **Attribute percentiles.** Per position, computed by the worker.
- **Requirement profiles.** Eight are seeded from the scout notes. The three Malmö FF ones are labelled drafts.
  Clubs write their own at /profiles.
- **Fit score and standouts.** Pure functions with unit tests. Find by role (/roles) ranks a profile's positions
  by fit, with coverage and standout qualities on every row.
- **Search filters.** Country, age and contract end, with the age and contract filters marked as running on
  demo data.
- **Player profile.** Split into Overview, Scout view, Risk and market, and Similar players. The fit card shows
  one bar per attribute, each with its source label and a Demo mark where one applies.
- **Demo seed.** `worker/seed_demo.py` creates the demo data, and `--remove` deletes all of it.

**Checks.**
- The gate ran all seven checks in order: deslop, no-comments, verify, qa, design-review, thermos and review.
- Results: pytest 31 passed, `npm test` 46 passed, `npm run build` passed, and `npx astryx doctor` gave 0 failures
  (2 font warnings that predate this build).
- QA covered every screen at 1280 and 390 px with no console errors. Numbers checked against the database include
  Osimhen's fit of 64, his 30 m sprint percentile of 88, filter counts of 2, 9, 12 and 31, and N'Dicka's fit of 44.
- Fixed from review:
  - Crosses claimed counted keeper sweeps and dropped catches, about twice the real number.
  - Saves now include penalty saves.
  - Through balls received now count only completed receptions.
  - Ball losses were ranked the wrong way on search.
  - A loader re-run reset the minutes threshold.
  - A goalkeeper's "standout quality" was 1v1 dribbling, because a measure almost no goalkeeper records ranked
    him first. A measure now counts toward an attribute only where at least half the position records it.

**Not measurable yet.**
- Acceleration, speed, stamina, explosiveness and agility exist only as physical tests. For now those tests are
  demo data, and agility has no test in the battery at all.
- Positional play, decision-making, movement, link-up play, use of both feet and all eight mentality items come
  only from scout ratings, which phase 2 adds.

**Weak stand-ins.**
- **First touch under pressure.** Receptions under pressure minus miscontrols under pressure. A heavy touch that
  leads to a dispossession a second later still counts as kept.
- **Runs in behind.** Through balls received plus receptions in the box. A run the passer never found is
  invisible in event data.
- **Strength in duels.** Ground and aerial duels won. It says nothing about holding the ball under contact.
- **Small groups.** These rankings rest on small groups: 4 attacking midfielders, 6 central midfielders, 6 right
  wingers and 8 left wingers. Every screen says so where it applies.

**Decisions made for you.**
- The five general profiles get no priorities from the notes. Their first two attributes are set very high and
  the rest high, and each profile says so.
- Fit counts a physical test as a third kind of evidence, alongside match data and scout ratings.
- Known effect: a winger measured only by demo sprint tests (exactly half the weighted profile) can rank above
  real match evidence. It follows the stated rule, it carries a Demo mark, and it ends when the demo data is
  removed.

## Phase 2: the scout's eye

**Built.**
- **Scout report form** (/players/[id]/report). A 1 to 10 rating for every attribute in the registry, grouped
  technical, physical, tactical and mental, and any rating can be left empty. It also takes where the player was
  seen, strengths, weaknesses, comments with examples, and a recommendation (sign, follow or pass). Authors can
  edit their own reports. Reports belong to the writer's organisation, and row-level security keeps them inside
  it.
- **Scout view tab.** Mentality comes first, with its own chart showing one dot per report plus the average. Each
  report follows, then the average per attribute.
- **Numbers beside the eye.** The match percentile and the scouts' average (rating x 10) sit side by side, and a
  gap of 25 points or more is named in words.
- **Fit.** It now counts scout ratings. Seko Fofana's fit for the scout's club went from 32 to 51 once ratings
  counted, and both numbers were checked by hand (226/7 and 609/12).
- **Demo reports.** The seed writes 87 of them on 60 players, from two clubs. Their ratings follow the real match
  evidence with noise, so agreement and disagreement both show up.

**Checks.**
- The gate ran deslop, no-comments, verify, qa, design-review, thermos and review together with phase 3. The
  results are under phase 3.
- Isolation: scout2 (another club) sees "No reports yet" where the first club sees its reports, and gets a 404 on
  their edit URLs.

**Not measurable yet.** Every scout rating in the database is demo until real scouts write reports.

**Decisions made for you.**
- A report needs where the player was seen, a recommendation, and at least one rating or some text.
- The disagreement threshold is 25 points.

## Phase 3: risk and market

**Built.**
- **Worker.** A per-match index for every player and match of 30 minutes or more, with the stronger and weaker
  opponent split. Percentiles by age band (U17, U19, U21 and senior). xT through socceraction, read from our own
  StatsBomb-style export.
- **Exporter.** It writes the open-data layout, and a round trip through both socceraction and kloppy proves
  outside tools can read it.
- **Risk block.** Six lines with a status and a plain reason: stronger opponents, consistency, roles played,
  sample size, documented age and whether a transfer is realistic.
- **Per-match strip.** One cell per match, with the stronger and weaker split and a two-sentence explanation of
  the index.
- **Market details and physical tests.** Each has an edit form. Preferred foot and weaker-foot share are also
  derived from event data and shown beside the entered foot. Tests are marked verified or not, and only an admin
  or the owning federation can verify one.
- **Age bands and age curve.** Percentiles by age band, and an age curve for the player's position.

**Checks.**
- The gate for phases 2 and 3 passed: pytest 34, `npm test` 93, tsc clean, `npm run build` passing, and
  `astryx doctor` 0 failures.
- Numbers checked by hand:
  - Kessié: crossing 67 by match data against 10 from the scouts, a match index of 61 ± 26, an average of 60
    against stronger sides and 67 against weaker, and 22% weaker foot.
  - Fofana's index and foot counts.
  - A 4.05 s 30 m sprint ranking 88th.
- Fixed from review:
  - Saving the market form wrongly cleared the demo mark on untouched values.
  - The risk block counted unpublished matches.
  - xT had no age-band percentile.
  - Two players could share a StatsBomb id without anyone noticing.
  - A federation could act on any live player.
  - Test percentiles changed with the viewer.
  - Two RLS holes, found while reviewing the market form: an owner could approve his own under-18 profile, and a
    consent could be rewritten. Column-level grants close both, and RLS tests cover them.

**Not measurable yet.**
- Age bands run on demo birth years, and only 5 qualified players fall in U19 or U21, so most bands have too few
  peers. The screens say so.
- There is no outside league-strength rating, so "stronger opponent" compares goal difference per match within the
  competition.
- Possession value is xT only. VAEP needs far more matches than one tournament.

**Weak stand-ins.**
- **The per-match index.** It weighs all 29 counting measures equally. It is a consistency signal, not a rating.
- **Stronger opponents.** In a tournament most teams play three to seven matches, so the split often rests on one
  or two matches. When either side has fewer than 2, the risk line says "unknown".

**Decisions made for you.**
- Risk thresholds: a drop of more than 10 index points or a spread above 20 is a caution, and so is a single role
  played.
- Preferred foot from match data needs at least 30 foot touches, and a weaker-foot share of 40% or more reads as
  both feet.
- Physical test values outside plausible ranges are refused.
- Demo market values start blank in the edit form.

## Phase 4: accounts, trust and workflow

**Built.**
- **Login.** Supabase-compatible: `auth.users` with bcrypt and `auth.uid()` from the JWT claims. Every page reads
  through `db()` as role `authenticated` or `anon`. A unit test fails if any page imports the superuser
  connection.
- **Row-level security** on every table, with column-level grants, and an audit of 23 tests that act as each
  demo user (worker/test_rls.py).
- **Sign-up for all eight user types.** A player can also claim an existing profile, which an admin approves.
  Adults go live on consent. Under-18s name a guardian and wait in the approval queue. Staff accounts start
  inactive.
- **/account.** Status, the admin's note, consent and its withdrawal, which hides the profile at once and queues
  deletion of personal data, plus "N clubs viewed this profile" and agent confirmation.
- **/admin/approvals and /admin/coverage.** Under-18 sign-ups, profile claims and inactive staff, plus coverage
  of each organisation by competition.
- **/verify** for a federation or admin, covering only the players of the federation's own competitions:
  federation registration, ID check, photo, contract status, and a private ID upload only admins can open.
  Verified and unverified profiles look different everywhere.
- **Profile views** are recorded.
- **Scout workflow.** Shortlists with notes and ranks, saved searches with new-match alerts, and a shadow team
  with shortlisted players ranked in each position.
- **Scouting report.** It prints to A4 and can be shared by a 14-day link that renders as its creator.
- **Agent tools.** Own clients, confirmed by the player or guardian, and sending a profile to a club, which
  arrives in the club's /inbox.
- **Introduction requests** are recorded for the partner agency. There is no messaging.
- **Competition and team pages.**

**Checks.**
- The gate ran all eight checks, including cso: pytest 46, `npm test` 98, tsc clean, `npm run build` passing,
  and `astryx doctor` 0 failures.
- The cso review fixed one critical finding, three high, three medium and five low, each with a test first (see
  decisions.md).
- Browser flows, checked as each role at 1280 and 390 px:
  - Sign-up for an adult and two minors, then approve and decline.
  - Withdraw consent, then confirm a scout can no longer see the profile.
  - Verification, including the ID file rules: admin 200; federation and scout 404.
  - Shortlist and shadow team.
  - Agent share, then the inbox.
  - Introduction request, then agency status.
  - Saved-search alert.
  - Removing coverage hides the competition.
  - The printed report and the shared link, including expiry.

**Still open.**
- No rate limit on sign-in.
- No way to revoke a share link before it expires.
- Sessions are 14-day signed cookies with no server-side revocation.
- Demo passwords use bcrypt cost 6. Real sign-ups use 10.
- Coordinators and analysts are still "staff" for match writes in every competition. This is settled in phase 5.

**Decisions made for you.**
- The claim search shows only live profiles, putting minors' privacy ahead of convenience.
- An agent needs the player's (or guardian's) confirmation before editing his details.
- A decline needs a note, because the player reads it.
- Withdrawing consent keeps the guardian's name as the record of who signed, and deletes the contact.

## Phase 5: the data engine, stage 1

People enter every event. The tools below take a match from video to published numbers, and nothing reaches a
profile until a second analyst's sample agrees.

**Built.**
- **Match list** (/matches). Each match the user is assigned to, with its status: uploaded, tagging, review or
  published. On a phone the rows become cards.
- **Match sheet** (/matches/[id]/sheet) for the club coordinator. Line-ups, shirt numbers, positions,
  substitutions, goals and cards, with players picked from the squad list. `lib/match-sheet.ts` checks each entry
  as it is typed, in the browser and again on the server. Offline, a service worker (`public/sw.js`) serves the
  page, the sheet waits on the phone, and it is sent once when the connection returns.
- **Video upload** (/matches/[id]/video). Uploads go in 8 MB chunks and resume from the last chunk the server holds.
  By default the file goes to `storage/videos` and plays in the browser's own player. With Mux keys set, it uses
  Mux direct upload and signed playback.
- **Import** (/matches/[id]/import). A documented CSV layout (`docs/import-csv.md`) and StatsBomb-style JSON. An
  import is all or nothing: one bad row and nothing is written, and every error is listed by row.
- **Event log tool** (/matches/[id]/log). Video player, keyboard shortcuts, a click on a 2D pitch for the location,
  and the event types and outcomes from `lib/event-spec.ts`. Each event saves on entry with its `video_seconds`.
  The analyst marks where each period starts in the video.
- **Quality check** (/matches/[id]/qc). Rule flags first: an event outside playing time, an event by a player
  already substituted, a player not on the match sheet. Then a second analyst logs a 15-minute sample again
  without seeing the first analyst's events. Two events agree when type and player match within 3 s and the
  locations are within 10 pitch units. A match publishes at 90% agreement. All four numbers are rows in
  `settings`. Each analyst's accuracy is shown.
- **Publish.** Only from review, only when the latest check passed with zero rule flags, and only when nothing
  changed after that check. Publishing queues one `compute_match_metrics` job in `jobs`.
- **Clips and playlists** (/playlists, /playlists/add, and "Add actions to a playlist" on the player page). A
  scout collects actions into a playlist, then renames, reorders, notes and plays them. A clip is the match video
  from `video_seconds` minus 5 to plus 8.
- **Exporter.** The match's reviewer or an admin requests a StatsBomb-style JSON export. The worker writes it, and
  only they can download it.
- **More than one competition.** Search, find by role, the player page, compare, the printed report and the
  shared link each take a competition choice. The worker computes every competition.
- **Report summaries.** "Write summary" on the Scout view tab queues a job. The worker writes a plain template
  from the player's numbers, or calls the Claude API when `ANTHROPIC_API_KEY` is set.
- **The five written standards** (/standards): filming, match sheet, event definitions, quality check and
  verification, read from `docs/standards/`.
- **Staff scope.** Coordinators, analysts and reviewers read and write only the matches assigned to them, each
  role its own tables. Status moves only through `app.advance_match` and `app.publish_match`.
- **Playwright tests.** 13 tests in 7 files: sign-in, match sheet (3, two of them offline), import (3), event
  log, competition fallback, playlist ids, and match files (3).
- **Demo league.** The seed adds "Demo League (demo)": two clubs with 16-player squads, one match waiting for its
  sheet and tagging, and an 8-minute test-pattern video. It has no events. Those are logged in the app.

**Checks.**
- The gate ran deslop, no-comments, verify, qa (two rounds), design-review (two rounds), thermos, review and
  cso. Each check that changed code has its own commit, de48e0d to 7441f2e. Verify needed no change.
- Results at 7441f2e: pytest 107, `npm test` 111, tsc clean, `npm run build` passing, `npx astryx doctor` 0
  failures, and Playwright 13 of 13. `scripts/check-fresh-db.sh` applied all 16 init files. The from-zero run in
  the final report reproduced pytest 107 and `npm test` 111 on a fresh clone.
- Every phase 5 screen was opened at 1280 and 390 px as each role that uses it, with zero console errors and no
  horizontal scroll.
- Numbers checked against the database by hand:
  - Search shows 160,113 events, which is 160,230 minus the 117 of hidden players. Nigeria v Côte d'Ivoire has
    2,628 events. Osimhen has 7 matches, 687 minutes, 24 shots and 87 passes.
  - Home tiles: 151 qualified, 52 matches, 24 teams. The match list shows 53 matches, 52 from AFCON and 1 demo.
  - A failing check: analyst 6 events and reviewer 5 in the sample, 2 agreeing, so 2 / max(6, 5) = 33%, and
    publish was refused. Two rule flags on screen matched the two in `qc_runs.flags`.
  - A passing check: 6 of 6 agreeing, time offsets of 1 to 2 s and 3.1 to 5.7 units. Analyst accuracy
    (33.33 + 100) / 2 = 67%.
  - After publish: one metrics job, 22 season rows and 22 match-index rows. Passes 2, recoveries 1,
    interceptions 1, tackles won 1, touches 6 and long passes 1 (36 units) match a hand count of the events.
  - The export has 12 entries: the 6 logged actions plus 2 Starting XI, 2 Half Start and 2 Half End.
  - A clip at 271 s shows 4:26 to 4:39, the database's 266 to 279. A clip played from 55 to 68.00 s on the demo
    video.
  - Two competitions (World Cup 2022 loaded into a throwaway copy): Antonee Robinson's ball recoveries 7.21 per
    90, 100th percentile of 38 full-backs. Hakimi opens on the World Cup (661 minutes, 7 matches), and on AFCON
    shows 393 minutes, 4 strip cells and 95 against stronger sides. Mbappé's fit of 93 = (2 x 100 + 2 x 78 +
    2 x 100) / 6.
  - /roles, Explosive winger: 71 of 102, reproduced in SQL.
- Fixed by the gate, each with a test that failed first:
  - CRITICAL: a write that passed its status check while a publish was in flight committed into the published
    match. Reproduced with two sessions for an event, the periods, a line-up and a sheet event.
  - HIGH: an analyst could edit events in review after a passing check, and "back to tagging, then review again"
    reused the old pass. Publish now refuses when the data changed after the latest check.
  - The metrics job failed when a competition had no shot.
  - `?comp=` with an unknown value crashed the player page, the print report and the shared link.
  - The sheet of a published match could still change. Scouts could read events and video of unpublished
    matches. The export download was not limited to the reviewer.
  - Minutes 131 to 135 passed the sheet form, failed the database check and retried forever.
  - The match's own analyst could read the second analyst's sample.
  - A deactivated staff member could still stream assigned video.
  - A summary job queued before consent was withdrawn still ran, and withdrawal left the summaries.
  - Concurrent chunk uploads at one offset all appended, and uploads and imports had no size cap.

**The data specification against the event spec.** The business plan lists what must be recorded. This is every
item, how we record it, and the gap.

| Business plan item | How we record it today | Gap | What closing it takes |
|---|---|---|---|
| Identity: name, nationality, club | `players.display_name`, `nationality`; club is the team in the latest line-up | None | |
| Identity: verified date of birth | `player_identity` (private) and verifications; scouts see `birth_year` | Values for match-data players are demo | Verification in the field |
| Identity: height, preferred foot | `players.height_cm`, `preferred_foot` (demo); foot also from event body parts | Demo values | Real entry through the market form or sign-up |
| Identity: positions | `lineups.position` per match; `players.primary_position` across all competitions | One position per match, no in-match change of role | A line-up row per stint |
| Identity: contract end, representative | `player_market` (demo) | Demo values | Real entry |
| Playing time: matches, starts, minutes, position | `lineups.minutes_played`, `started`, `position` | Starts are stored but not shown | A starts count per competition on the profile |
| Passing: attempted and completed | `passes`, `passes_completed`, `pass_accuracy_pct` | None | |
| Passing: forward passes | Derivable from `end_x > x` | Not a metric | A new `METRICS` entry, which changes the style-vector size and needs a migration |
| Passing: long passes | `long_passes` (32 units or more) | No long-pass accuracy | A ratio key and a migration |
| Passing: crosses, key passes | `cross`, `shot_assist` and `goal_assist` flags; `crosses`, `key_passes` | None | |
| Attacking: shots, on target, goals, assists | `shots`, `shots_on_target`, `goals`, `assists` | None | |
| Attacking: dribbles attempted and completed | `dribbles_completed`, `dribble_success_pct` | Attempts are not shown on their own | A metric, if scouts want it |
| Attacking: touches in the box | `receptions_in_box` only | Touches in the box are not a metric | A new metric and a migration |
| Defending: tackles, interceptions | `tackles_won`, `tackle_success_pct`, `interceptions` | None | |
| Defending: clearances | The clearance type is logged | No metric | A new metric and a migration |
| Defending: blocks | `blocks` | None | |
| Defending: ground duels won | Tackles won; `duels_won` mixes tackles and aerial duels | No ground-duel measure of its own | Tackles won plus dribbles completed, with dribbled-past as losses, under a new key |
| Defending: aerial duels won | The `aerial_won` flag and Duel "Aerial Lost"; `aerial_duels_won` | No count or share of aerial duels lost | A ratio key |
| Defending: fouls | Fouls committed and won are logged | No metric | A new metric and a migration |
| Possession: touches, carries, recoveries | `touches`, `carries`, `progressive_carries`, `ball_recoveries` | None | |
| Possession: ball losses | `ball_losses` = miscontrols + dispossessions | Leaves out incomplete passes and failed dribbles | Agree the definition with the scout; one `METRICS` line |
| Goalkeeping: saves | Goalkeeper "shot saved"; `saves` | No save percentage; "shot faced" is not a choice in the log tool | Add "shot faced" to the event spec, then a save-percentage key |
| Goalkeeping: crosses claimed | Goalkeeper collected; `crosses_claimed` | Closed in cb65d5e: the log tool's "Claimed" now counts | |
| Goalkeeping: distribution | Goalkeeper passes; the goal-kick set-piece type | No distribution metric (long or short, goal-kick accuracy, throws) | Goalkeeper distribution ratios under new keys |
| Physical: distance, high-speed runs, sprints, recovery runs | Not recorded; only physical tests | Not recorded | Tracking data, a later stage |

**Not measurable yet.**
- No real match has gone through the pipeline. The only logged match is the 8-minute demo test pattern, and the
  analyst accuracy of 67% comes from two runs on it.
- The publish thresholds (90% agreement, 10 units, 3 s, a 15-minute sample) are untested on real footage. They
  are rows in `settings` so they can be tuned.
- The tagging tool for the ten test matches is not chosen. The import is tested only on our CSV layout and on
  StatsBomb JSON.
- The Claude summary path and the Mux path have not run, because no keys are set.
- The offline sheet test ran under `next dev` only, not under `next start`.

**Weak stand-ins.**
- **Agreement.** It covers a 15-minute sample. The other 75 minutes rest on rule flags and the first analyst.
- **Summaries.** The best measures are raw metric percentiles, so the phase 1 rule (half the position must
  record a measure) does not apply. In the from-zero run, Kouakou Herve Koffi's template summary named "dribbles
  completed (100th percentile)" as a goalkeeper's best measure.
- **Across competitions.** No league-strength rating exists, so numbers from two competitions are labelled side
  by side, not adjusted.

**Decisions made for you.** Each has a row in `docs/decisions.md`.
- Staff read and write only their assigned matches. The second analyst's sample is blind.
- Rule flags block publish. Publish also refuses when the data changed after the latest check.
- A write that waited on a publish fails, so a published match cannot be corrected in the app. There is no
  unpublish path.
- The competition is a URL parameter. Player pages default to the competition with most minutes, and lists to
  the newest competition with numbers.
- Playlists are for scouts only, and a clip is a media fragment on the match's playback URL.
- A video is at most 16 GiB, and an import file at most 20 MB. Sheet minutes stop at 130.
- One summary job runs at a time per player and competition.
- lxml 4.9.4 stays despite one advisory, because socceraction requires lxml below 5 and the worker parses no XML.

**Still open.**
- No unpublish path. Correcting a published match needs a database session.
- The offline sheet replaces the whole sheet when it sends, so it can overwrite a newer edit made on the server.
  Only the assigned coordinator writes it.
- The sheet's cache and stored draft are not cleared at sign-out, and the key is per match, not per user.
  Clearing them would destroy unsent offline sheets.
- Scouts can read draft line-ups and sheet events of unpublished matches. Player names stay hidden by RLS.
- `request_summary` has no per-user quota, which matters once a key makes each job a paid call. A scout cannot
  see a pending summary job.
- The upload lock is in-process, so it holds for one Node server only.
- A new competition is visible to no club until an admin grants coverage, and old saved searches move to the
  newest competition.
- Every new metric from the gap table changes the style-vector size and needs a migration.
- The demo match has video but no events, so a playable clip needs an analyst to log one.
- The match-sheet offline test once matched two "Sent" banners after a reload. 15 reruns did not reproduce it.
- A file picked before the import page hydrates is dropped, and the user picks it again.
- A write that fails in the publish race shows a generic error in the events and import routes.
- /r/ with a bad token returns HTTP 200 with the "expired or no longer shared" page.
- Design leftovers: the event log's "Recent events" actions column is clipped at 390 px (a desktop tool), the
  home tiles leave one alone on a phone, the player header buttons are ragged on a phone, and two label sets
  name the same status ("Uploaded" and "Video uploaded").
- Not built: drag to reorder a playlist, autoplay of the next clip, and the summary in the printed report.
- Route preambles and competition picking repeat across about 12 files. Merging them changes no behaviour and is
  left for later.

## Final report

### What each phase delivered

**Phase 1, buyer-first scouting.** A registry of 30 attributes in the scout's words, each with its source and
stand-in metrics. 33 worker metrics, up from 16, and a loader that keeps 160,230 events, up from 138,775. Eight
requirement profiles, a club's own profile at /profiles, and a tested fit score that shows coverage and says "not
enough evidence" under half. Find by role, search filters for country, age and contract, and a player page in
four sections. One seed script creates the labelled demo data, and `--remove` deletes it.

**Phase 2, the scout's eye.** A scout report with a 1 to 10 rating for every attribute, strengths, weaknesses,
comments and a recommendation. Mentality has its own section and chart. Match percentiles and the scouts' average
sit side by side, and a gap of 25 points or more is named. Fit counts scout ratings, and ratings stay inside the
writing organisation.

**Phase 3, risk and market.** A per-match index with a stronger and weaker opponent split, a six-line risk block,
market details and physical tests with edit forms, percentiles by age band, an age curve, and xT through
socceraction. The StatsBomb-style exporter was built here, and socceraction and kloppy both read it.

**Phase 4, accounts, trust and workflow.** Local Supabase-compatible login, row-level security on every table
with an audit of each demo user, and sign-up for all eight user types. Under-18s wait in an approval queue.
Consent withdrawal hides a profile at once. Verification, shortlists, saved searches with alerts, a shadow team,
a report that prints to A4 and shares by link, agent tools, introduction requests, coverage by competition, and
competition and team pages.

**Phase 5, the data engine.** The match sheet that works offline, resumable video upload, CSV and StatsBomb JSON
import, the event log tool, a quality check with rule flags and a blind second-analyst sample, a publish gate
that queues the metrics job, clips and playlists, the exporter on request, any number of competitions, report
summaries, the five standards pages, 13 Playwright tests, and staff scoped to their assigned matches.

### Checks still red

No check fails. These checks are partial or did not run:
- The gstack `verify` runner could not start (no git remote, POLICY_SOURCE_UNAVAILABLE). Its checks ran by hand
  and were green.
- The cso helper ran out of its 600 s budget after `auth.ts`, the video route, the Mux webhook and the app
  model. The rest was reviewed by reading the code.
- Dependency advisories, run at the close. `npm audit --omit=dev` and `npm audit` in `apps/web` found 0
  vulnerabilities. `uvx pip-audit` on the worker's locked requirements (200 lines from `uv export --frozen`) found
  1 advisory: lxml 4.9.4, PYSEC-2026-87 (CVE-2026-41066), fixed in 6.1.0. It reaches lxml through socceraction
  (which requires lxml below 5) and kloppy. It concerns parsing untrusted XML, and no file in `worker/` uses XML.
  It stays open until socceraction allows lxml 6.
- The offline sheet test has not run against `next start`.
- The Claude summary path and the Mux upload and playback path have not run without keys.
- `npx astryx doctor` reports 2 theme-font warnings. Both are false positives: `app/layout.tsx` loads DM Sans by
  a link tag.
- Playwright did not run in the from-zero check below. Its last run was 13 of 13 at 7441f2e.
- There is no CI.
- Security items still open from phase 4: no rate limit on sign-in, no screen to revoke a share link (RLS already
  lets the organisation delete one), and 14-day cookies with no server-side revocation. Deactivating a user now
  cuts access at once.

### Values that cannot be measured yet

- Acceleration, speed, stamina, explosiveness and agility exist only as physical tests, which are demo data.
  Agility has no test in the battery.
- Every scout rating, including all eight mentality items, is demo until real scouts write reports.
- Birth years, heights, preferred foot, contract dates and availability are demo for match-data players. Age
  bands run on demo birth years, and most bands have too few peers.
- "Stronger opponent" compares goal difference within the competition, because no league-strength rating
  exists. The same gap means numbers across competitions are labelled, not adjusted.
- Possession value is xT only. VAEP needs far more matches than one tournament.
- Distance, high-speed runs, sprints and recovery runs need tracking data.
- Analyst accuracy and the publish thresholds have run only on the 8-minute demo match.
- The rest of the data specification is in the phase 5 gap table.

### Decisions

Every decision made for you is a row in `docs/decisions.md`, with why, the evidence and the result. Each phase
entry above lists the ones that change what a user sees. Superseded calls get a new row. The sheet's minute cap
of 130 replaces the earlier 135, for example.

### Start the product from zero

Needs Docker, `uv`, Node 22 or newer, ffmpeg for the demo video (the seed skips the video without it), and
network for step 2. From the repository root:

```sh
docker compose up -d                                              # Postgres 16 + pgvector on 54330, every migration
cd worker
uv run --python 3.12 python load_statsbomb.py --min-minutes 270   # AFCON 2023 open data, downloads from GitHub
uv run --python 3.12 python metrics.py                            # per-90, percentiles, attributes, xT, match index, age bands
uv run --python 3.12 python seed_demo.py                          # labelled demo data and the demo logins
uv run --python 3.12 pytest
uv run --python 3.12 python jobs.py &                             # the worker; `jobs.py --once` drains and exits
cd ../apps/web
npm ci
npm test
npm run dev -- -p 3007                                            # or: npm run build, then SESSION_SECRET=... npm start -- -p 3007
```

Open http://localhost:3007 and sign in as `scout@demo.scout` with `scout-demo`. `seed_demo.py --remove` deletes
every demo row, and a second `seed_demo.py` puts them back.

These commands were run on 2026-11-22 on a fresh clone of 7441f2e, with the clone's compose port changed to
54333 and `DATABASE_URL=postgres://postgres:postgres@localhost:54333/postgres`. The dev database was not
touched. The npm and uv caches were warm, so a first install on a new machine takes longer.

| Command | Result | Wall time |
|---|---|---|
| `docker compose up -d` | Container and a fresh volume created; init finished with no ERROR or FATAL | 0.6 s |
| `load_statsbomb.py --min-minutes 270` | 1 competition, 24 teams, 512 players, 52 matches, 1,607 line-ups, 160,230 events | 126 s (network) |
| `metrics.py` | 711 player-role rows, 151 qualify at 270 minutes; xT on all 711; 1,301 match-index rows | 54 s |
| `seed_demo.py` | 6 orgs, 11 users, 512 players filled, 7 under 18, the demo video made | 8.2 s |
| `seed_demo.py --remove` | Users, orgs and scout reports to 0; 512 players, 52 matches and 160,230 events untouched | 0.3 s |
| `seed_demo.py` again | The same counts as the first seed: 11 users, 6 orgs, 87 reports, 546 players, 53 matches, 2 competitions | 0.6 s |
| `pytest` | 107 passed | 12 s |
| `jobs.py --once`, with a summary and an export job queued | Both done on the first attempt; Osimhen's template summary reads "687 minutes in 7 matches"; export files written | 0.7 s |
| `npm ci` | Installed; 0 vulnerabilities | 4 s |
| `npm test` | 111 passed | 0.7 s |
| `npm run build` | Passed | 8.5 s |
| `SESSION_SECRET=... npm start -- -p 3017` | Ready; /login answered 200 on the first try | under 1 s |
| Sign in as `scout@demo.scout` through the login form, then load / | 303 to /, then 200 with "Qualified 151"; /standards, /standards/event-definitions, /matches and /playlists answered 200 | 0.7 s for / |

The run found two gaps in the README, now fixed: `npm start` needs `SESSION_SECRET`, and step 2 needs network.
The README also says `npm ci` instead of `npm install`, names `jobs.py --once`, and says that Playwright exits at
once when another `next dev` runs in `apps/web`. The web server and the throwaway container and volume were
removed after the run.
