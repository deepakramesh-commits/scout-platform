# Build prompt: Scout, the scouting platform for African football

You are building Scout into a full product. Work in this folder (`scout-platform`).

Read these in full before you change anything, in this order:

1. This prompt.
2. `docs/technical-plan.md`: the architecture, event spec, pipelines, security
   rules and build order. It is the source of truth for how things are built.
3. `docs/scout-notes-en.pdf`: what a scout for Swedish clubs looks for. It is the
   source of truth for what the scouting side must show.
4. `docs/business-plan.pdf`: the product, the users, the data specification and
   the revenue stages.
5. `README.md`, then the code.

Build the full product, all five phases, in one run. Do not stop to ask
questions. Every open question already has an answer in section 7. For
anything else, make the sensible choice, write it in the decision record, and
keep going.

## 1. What the product is

Scout is a data and scouting platform for African football. It has two sides.

- **Side 1, the data engine.** Match video goes in. Verified player statistics
  come out. Clubs film matches. People log each match in our forms. A second
  analyst checks a sample before anything is published.
- **Side 2, the scouting platform.** Clubs abroad search, compare, shortlist and
  request players. The first buyer is Malmö FF in Sweden.

The rule from the scout notes that shapes side 2: **start with the European
buyer and work backwards to the African talent.** Clubs judge a player on two
axes at once (can he help us win, can he grow in value over about 18 months)
and they want a lower risk of a failed signing. A player with three or four
standout attributes can matter more than a league's top scorer.

Users and what they pay:

| User | What they do | Device | Pays |
|---|---|---|---|
| Club scout | Search by role and metric, watch clips, shortlist, export reports | Laptop | Club subscription |
| Agent | Same search, track own clients, send profiles to clubs | Laptop, phone | Per seat |
| Federation or league | Schedule matches, see its competition's data, verify IDs | Laptop | No |
| Academy or club coach | Upload test results, see own players' reports | Phone | Free |
| Player and guardian | Claim profile, give consent, add test results, see own stats | Phone | Free |
| Analyst (our staff) | Log events on match video | Desktop | Paid per match |
| Club coordinator | Fill in the match sheet | Phone | No |

Business rules the product must enforce:

- Every subscriber sees the same data at the same time.
- Representation by the partner agency never changes a ranking or a score.
- Unverified profiles are clearly marked.
- A subscription unlocks leagues, not features. Access is by coverage.

The product is called **Scout**. "Way Scout" in the notes is a different app.
Do not use that name anywhere.

## 2. Where the code is today

- `apps/web`: Next.js 16, React 19, server components, the Astryx design system
  with a custom dark theme in `src/themes/scout/` (after editing it run
  `npx astryx theme build src/themes/scout/scoutTheme.ts`). Pages: search
  (`app/(home)`), player profile (`app/players/[id]`), compare.
- `worker`: Python 3.12 run with `uv`. `load_statsbomb.py` loads StatsBomb open
  data for AFCON 2023. `metrics.py` holds the `METRICS` registry and computes
  per-90 values, position percentiles and a 16-number style vector.
- `supabase/migrations`: Postgres 16 with pgvector on host port 54330, through
  `docker-compose.yml`. Tables already exist for orgs, app_users (with roles),
  consents, player_identity, physical_tests, shortlists, profile_views, jobs
  and events. `docker-compose.yml` mounts each migration by name, so add every
  new migration there too.
- There is **no login**. The app connects as the `postgres` superuser.
- There is **no git repository**. Run `git init` and commit before you start,
  then commit after every verified unit of work.

Facts about the data you must respect:

- 512 players, 52 matches, 138,775 events, one competition. Only players with
  270 or more minutes get percentiles (the plan's rule for a league season is
  450). Some positions have very few ranked players: 4 attacking midfielders,
  6 central midfielders, 6 right wingers, 8 left wingers. Say so on screen
  wherever a ranking rests on a small group.
- `players.birth_year`, `preferred_foot` and height are empty. Fill them with
  labelled demo data (section 4, rule 2) so age filters, age bands and the age
  curve work. Include some under-18 players so the approval queue has entries.
- The loader keeps twelve event types. It drops pressure, miscontrol,
  dispossessed and dribbled-past events, and the under-pressure and
  first-time-shot flags. The loader is idempotent, so it can be extended and
  re-run.
- The size of the `style` vector in the migration must equal `len(METRICS)`.
  Change both together.
- Web pages call `per90[key].toFixed(2)`. Guard for missing values before you
  add any metric that can be empty.
- Coordinates are the StatsBomb pitch, 120 by 80, attacking toward x = 120.
- `events.video_seconds` is the match clock today, because open data has no
  video.

Architecture rules from the technical plan:

- The web app and the worker never call each other. The app writes rows and
  jobs to Postgres. The worker takes jobs with `select ... for update skip
  locked` and retries failures.
- A match moves through uploaded, tagging, review, published. Only published
  matches feed profiles.
- A clip is the match video played from `video_seconds` minus 5 to plus 8
  seconds. There is no clip table.
- The event format stays StatsBomb-style, so kloppy and socceraction can read
  an export unchanged.

## 3. Skills to use

These skills are installed on this machine. Invoke each one by name at the
point described. If a skill is missing or fails to load, note it in the
decision record and continue with the closest listed skill.

| When | Skill |
|---|---|
| The whole job: restate the goal, plan, build in small verified units | `pstack:poteto-mode` |
| A decision record for work the user reviews later | `pstack:show-me-your-work` |
| Before the phase plan is final | `plan-eng-review`, then `plan-design-review` |
| Any data model or change that crosses a module boundary | `pstack:architect` |
| Scoring logic, worker metrics, quality checks, form validation | `pstack:tdd` |
| Any `.ts` or `.tsx` file | `pstack:typescript-best-practices` |
| Every screen | `astryx` (and `apps/web/.claude/CLAUDE.md`) |
| Shaping a screen before writing it | `impeccable`, `ux-designer` |
| Any chart | `dataviz` |
| Motion and small details | `emil-design-eng`, `animate` |
| A public landing page only, never an app screen | `taste-skill` |
| All browser work | `browse`. Never use the `mcp__claude-in-chrome__*` tools |
| End of each phase, in this order | `pstack:deslop`, `pstack:no-comments`, `verify`, `qa`, `design-review`, `pstack:thermos`, `review` |
| Once login exists, and before the last phase closes | `cso` |

Astryx rules that are easy to break: start a page from a template, read a
component's props with `npx astryx component <Name>` before using it, no raw
`div`, no hex colours or pixel values, colours only through the theme. Motion
follows `app/motion.css`: transform and opacity only, under 300ms, reduced
motion handled.

Fix what a review finds, then run that check again, up to three attempts.

## 4. Rules that do not bend

1. **No competitor products.** Hudl is a competitor: no Wyscout, Sportscode or
   Hudl cameras, as a dependency, an import format or a recommendation.
2. **Demo data is allowed for now, and always labelled.** Where real data is
   missing, generate realistic demo values so every screen is full: birth
   dates, height, preferred foot, contract dates, availability, physical
   tests, scout reports with mentality ratings, shortlists, organisations and
   one user of each type. Rules for it:
   - Every demo row or value carries an `is_demo` flag in the database.
   - Every screen that shows a demo value marks it "Demo".
   - One seed script creates it, and one command removes all of it.
   - Match events and the numbers computed from them are never faked. They
     come only from the real match data.
   Without demo data, a value that was not measured is shown as missing.
3. **Every attribute shows its source**: match data, partly match data, a
   scout's rating, or a physical test.
4. **Accuracy before automation.** People enter the data first. AI comes in
   later stages and only assists. The match sheet and the sample check stay
   with people at every stage.
5. **Players of every age are in the database.** The rules differ by age:
   - 18 and over: the player signs up, accepts the consent screen, and the
     profile goes live.
   - Under 18: the sign-up names a guardian and waits as "pending approval".
     It goes live only when one of our admins approves it.
   - Profiles created from match data follow the same rule once a birth date
     is known. Until then they are shown as "age not recorded".
   Legal review is handled outside this build. Do not block on it.
6. **Private data stays private.** Row-level security on every table.
   `player_identity` and ID documents have no scout-facing access. Scouts see
   only `id_verified` and `birth_year`. Withdrawing consent hides the profile
   at once. A scout's ratings of a person are visible only to members of the
   organisation that wrote them.
7. **Keep search, profile and compare working** through every phase.
8. **No new dependency for a few lines of code. No paid service is required
   to run the product.** Put each one (video hosting, AI summaries) behind a
   small interface with a free local default, and switch to the paid service
   only when its key is present in the environment.
9. Malmö FF content is a draft until the club confirms it. Label it that way.

## 5. What to build, in phases

Build the phases in order. At the end of each phase run the checks in section
3, fix what they find, commit, add a short report to `docs/build-log.md`, and
**go straight on to the next phase**. Do not wait for review. If a check still
fails after three attempts, record it in the build log and continue.

### Phase 1: buyer-first scouting (works on the AFCON data)

**Attribute registry.** One registry in the scout's own words, grouped as
technical, physical, tactical and mental. For each attribute: a label, a
source, and the metrics that stand in for it. Starting point:

| Attribute | Source | Stand-in metrics |
|---|---|---|
| First touch under pressure | Partly match data | Share of receptions kept under pressure |
| Passing quality | Match data | Pass accuracy, progressive passes, key passes |
| 1v1 dribbling | Match data | Dribbles completed, dribble success |
| Finishing | Match data | Goals, xG, first-time shots |
| Final pass | Match data | Key passes, assists |
| Crossing | Match data | Crosses |
| Carrying the ball forward | Match data | Progressive carries |
| Runs in behind | Partly match data | Through balls received, receptions in the box |
| Pressing | Match data | Pressures |
| Ball winning | Match data | Recoveries, interceptions, tackles won |
| 1v1 defending | Match data | Tackles won, tackle success |
| Strength in duels | Partly match data | Duels won |
| Acceleration, speed, stamina, agility | Physical test | None yet |
| Positional play, decision-making, movement | Scout rating | None |
| All mentality items | Scout rating | None |

Add the missing metrics to `worker/metrics.py`, with tests. Pressure, first
touch under pressure and first-time shots need event types and flags that are
outside the twelve-type event spec. Add them: extend the loader for the open
data, and add them to the event spec and the event log tool.

**Requirement profiles.** Stored in Postgres. A profile has a name, an optional
club, the positions it applies to, an optional age range, and a list of
attributes with a priority (very high, high, medium). Seed eight:

- Explosive winger: speed and acceleration, 1v1, chance creation, both flanks.
- Modern striker: runs in behind, movement, strength, finishing with few
  touches, pressing.
- Dynamic central midfielder: ball winning, athletic ability, covering ground,
  progressive passing, decision-making.
- Modern centre-back: speed and recovery, duels, positional play, comfort on
  the ball, defending large spaces.
- Attacking full-back: running capacity, speed, 1v1, crossing and passing, work
  in both directions.
- Malmö FF striker (draft): runs in behind, acceleration, finishing and
  movement at very high. Strength, first touch, pressing and link-up play at
  high.
- Malmö FF full-back (draft) and Malmö FF wide midfielder (draft): take the
  attribute lists from section 5 of the scout notes. The notes give no
  priorities for these two, so set every attribute to high and say so.

Add a simple screen where a club writes its own profile. This is how a club
posts the positions it needs.

**Fit score.** One pure function with unit tests. For each attribute, the value
is the average of the evidence that exists: the position percentile from match
data, and the scout's rating on a 0 to 100 scale. Weight by priority. Leave out
attributes with no evidence. Always show coverage, for example "5 of 8
measured". If less than half the weighted profile is measured, show "not
enough evidence" instead of a score.

**Standout qualities.** The one or two attributes where the player is above the
85th percentile in his position. Show them first on the profile and in lists.

**Screens.**

- "Find by role": choose a profile, see players ranked by fit, with coverage
  and standout qualities in each row.
- Search gains filters for country, age and contract end date, running on the
  demo data until real values exist.
- Player profile, reorganised into sections: Overview, Scout view, Risk and
  market, Similar players.
- Fit card: the score, then one bar per attribute against the requirement,
  each with its source label.

### Phase 2: the scout's eye

- **Scout report form.** Ratings from 1 to 10 for technical, physical, tactical
  and mental attributes. Any rating can be left empty. Strengths, weaknesses,
  free comments with examples from matches, training and interviews, and a
  recommendation (sign, follow, pass).
- **Personal profile and mentality.** Eight ratings: mental strength, work
  ethic, leadership, self-confidence, discipline, competitive instinct,
  coachability, team player. The notes call this the most important difference
  from existing platforms. Give it its own section and chart.
- **Numbers beside the eye.** Show the statistics and the scout's ratings side
  by side so a disagreement is visible.
- Several scouts can report on one player. Show each report and the average.

### Phase 3: risk and market

- **Risk block**, one line per item with a clear status: performance against
  stronger teams, consistency across matches, number of roles played, sample
  size, whether age is documented, whether a transfer is realistic.
- Compute a per-match index for each player in the worker. Show a strip with
  one cell per match, and a split between stronger and weaker opponents.
  Explain in plain words how the index is built.
- **Market details**: height, preferred foot, contract end date, availability,
  transfer conditions, representative, with a form to edit them. Derive
  preferred foot and weak-foot share from the event data where you can.
- **Physical tests**: a form and display for the existing `physical_tests`
  table (10 m and 30 m sprint, endurance, jump), marked verified or not.
- Percentiles by age band (U17, U19, U21, senior) and an age curve for each
  position, once birth years exist.
- Possession value per action (xT or VAEP) with socceraction, as the technical
  plan describes.

### Phase 4: accounts, trust and workflow

- Login and organisations with Supabase auth. Roles from `app_users`.
  Row-level security on every table, then an audit of every policy.
- **Sign-up for every user type** in the table in section 1.
- **Player sign-up and consent**, using `consents`, with the age rules in
  section 4: adults go live on consent, under-18s wait for approval.
- **Admin approval queue** for under-18 sign-ups: approve or decline, with a
  note, and the player sees the status.
- **Verification screen** for our field officer or a federation: federation
  registration, ID check, photo, contract status. Verified and unverified
  profiles look different everywhere.
- Record every profile view in `profile_views`.
- Shortlists with notes, using the existing tables. Saved searches that alert
  the scout to new matches.
- **Shadow team**: a pitch with shortlisted players ranked in each position.
- **Scouting report** that prints cleanly to PDF and can be shared by link:
  profile, fit against a chosen requirement profile, standout qualities, scout
  ratings, mentality, risk and market details.
- **Agent tools**: track own clients and send a profile to a club.
- **Introduction request** from a club to the agency. Record it. Do not build
  messaging.
- Access by coverage: an organisation sees the leagues its plan includes.
- Team and competition pages, so a federation sees its own competition.

### Phase 5: the data engine, stage 1 (people enter everything)

- **Match sheet form** for the club coordinator, about ten minutes: line-ups,
  shirt numbers, positions, substitutions, goals and cards. Players are picked
  from the squad list. Choices are fixed. Entries are checked as they are
  typed. It works offline on a phone and sends when a connection returns.
- **Video upload** that resumes after a dropped connection. Default: local
  storage and the browser's own player. With Mux keys in the environment: Mux
  direct upload and signed playback, as the technical plan describes.
- **Import.** The first ten test matches are logged in an existing independent
  tagging tool that is not chosen yet. Build an import for a documented CSV
  layout and for StatsBomb-style JSON, so any tool's export can be mapped in.
- **Event log tool** for a trained analyst: video player, keyboard shortcuts,
  a click on a 2D pitch for location, the event types and outcomes in the
  event spec. Each event saves on entry, so a crash loses at most one action.
  Events save `video_seconds`, so every number links to its clip.
- **Data specification.** The business plan lists what must be recorded,
  including goalkeeping (saves, crosses claimed, distribution), shots on
  target, long passes, blocks, aerial duels and ball losses. Check the event
  spec against it and list every gap in your report.
- **Quality check**: rule-based error flags (an event outside playing time, an
  event by a player already substituted, a player not on the match sheet),
  then a second analyst logs a sample again. A match publishes only when event
  counts and locations agree within a set tolerance. Show each analyst's
  accuracy.
- Publishing a match queues the metrics job in the `jobs` table.
- Clips and playlists: a scout collects actions into a playlist.
- An exporter that writes StatsBomb-style JSON.
- Support more than one competition everywhere. The worker and the pages
  assume one today.
- **Report summaries**: a job writes a short scouting summary from the
  player's numbers. Default: a plain template. With an Anthropic API key in the
  environment: the Claude API, as the technical plan describes.
- The five written standards as pages in the app: filming, match sheet, event
  definitions, quality check, verification.
- Playwright tests for the forms and the import, because a data-entry bug
  corrupts data silently.

### Not in this build

AI player tracking, AI event suggestions, automatic logging, messaging between
users, and transfer or trial tracking are later stages. Leave room in the
schema (a source field and a confidence field on events) and build nothing
else for them.

## 6. Definition of done, for every phase

- Migrations apply on a fresh database with `docker compose up`, and the README
  quickstart works from zero.
- `uv run --python 3.12 pytest` passes in `worker`. Web unit tests pass.
  `npm run build` and `npx astryx doctor` pass in `apps/web`.
- You opened every new screen in a browser at desktop and phone width, checked
  the console for errors, and checked at least one number on each screen
  against the database by hand.
- Empty, loading and error states exist for every new screen.
- The build log lists what was built, what could not be measured, every
  place a stand-in metric is weak, and every decision you made for the user.

## 7. Decisions already made

Do not ask about these. Build to them.

| Question | Decision |
|---|---|
| Who can be in the database? | Players of every age. Under-18 sign-ups wait for admin approval (section 4). |
| Legal and regulatory review | Handled outside this build. Never block on it. |
| Pressing and first-touch events | Add them to the event spec, the loader and the event log tool. |
| Tagging tool for the ten test matches | Not chosen. Build the CSV and StatsBomb-style JSON import. |
| Video hosting | Local storage by default, Mux when keys are present. |
| Report summaries | Template by default, Claude API when a key is present. |
| Error tracking | Leave out. Log errors to the server console. |
| Quality check threshold | Publish at 90% agreement on event counts, with matched events within 10 pitch units. Make both numbers settings. |
| Who sees scout ratings | Members of the organisation that wrote the report. |
| First league | Unknown. Keep AFCON 2023 as the demo data and support any number of competitions. |
| Malmö FF priorities | Use the notes. Where they give none, set high and label the profile a draft. |
| Missing data | Fill with labelled demo data (section 4, rule 2). Never fake match events. |
| Product name | Scout. |

For anything not listed: choose the simplest option that fits the three
documents, record it in `docs/decisions.md` with one line of reasoning, and
continue.

## 8. When you finish

End with one report in `docs/build-log.md`: what each phase delivered, every
check that is still red, every value that cannot be measured yet, and the
decisions you made. Then give the commands to start the product from zero.
