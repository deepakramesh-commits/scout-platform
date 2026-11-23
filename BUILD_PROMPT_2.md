# Build prompt 2: clubs, squads, duplicates and the missing screens

You are extending Scout, the data and scouting platform for African football. Work in this folder
(`scout-platform`). Phases 1 to 5 of `BUILD_PROMPT.md` are built and live. This prompt adds what a walkthrough of
every user role found missing. The list is `docs/todo.md`, and every decision in it was made by the owner.

Read these in full before you change anything, in this order:

1. This prompt.
2. `docs/todo.md`: the gaps and the owner's decisions. It is the source of truth for what to build.
3. `BUILD_PROMPT.md` sections 1, 3, 4, 6 and 7. Its rules, skills and definition of done still apply, except where
   this prompt changes them.
4. `docs/build-log.md` (the final report at the end) and `docs/decisions.md`.
5. `README.md`, then the code: `supabase/migrations/`, `apps/web/lib/`, `apps/web/app/`, `worker/seed_demo.py`.

Build all four phases in one run. Do not stop to ask questions. For anything not decided here or in
`docs/todo.md`, make the simplest choice that fits, record it in `docs/decisions.md` with one line of reasoning,
and keep going.

## 1. Where the code is today

- HEAD is `79f9e50` or later, on `main`, pushed to a private GitHub repository. pytest collects 109 tests,
  `npm test` passes, Playwright 13 of 13, and `npm run build` and `npx astryx doctor` pass. Run them all once
  before you change anything, and record the baseline.
- **New migrations must be added in three places:** `supabase/migrations/`, a mount line in `docker-compose.yml`
  (each file is mounted by name, in order), and therefore `scripts/check-fresh-db.sh`, which reads those mounts.
  `scripts/migrate.sh` applies any file not yet in `ops.schema_migrations`.
- `unaccent`, `pg_trgm` and `fuzzystrmatch` are available in the local `pgvector/pgvector:pg16` image. On Render a
  non-superuser can create trusted extensions. Check that each one you use is trusted before you rely on it there.
- A staging copy runs on Render (free plan) at https://scout-fodc.onrender.com with AFCON 2023 and the full
  `seed_demo.py` data. `scripts/start.sh` runs `scripts/migrate.sh` on every start, so **every new migration will
  run against that live database on the next deploy**. Write each migration to be safe on existing data, and test
  it against a copy of a seeded database as well as an empty one.
- Facts you will build on, so you do not rediscover them:
  - `orgs.kind` is one of `club`, `agency`, `federation`, `academy`, `internal`. Buying clubs are `club`. African
    clubs exist only as `teams` rows, linked to an organisation by `teams.org_id`. In the demo that organisation is
    an `academy`.
  - `players.academy_org_id` gives an academy "ownership" through `app.owns_player()`. Only `seed_demo.py` sets it.
  - `players.status` (`live`, `pending_approval`, `declined`, `withdrawn`) decides who is shown.
    `players.visible_to_scouts` is a **generated column** (`status = 'live'`, phase 4 migration line 5) and cannot be
    written. The new "Show to other clubs" switch needs its own column, and the one definition of "visible" must
    then combine both.
  - The `app_age_rule` trigger treats a player as under 18 by **birth year only** (`year(now) - birth_year`). Use
    `player_identity.date_of_birth` wherever it is known, for the age rule, the 18th-birthday handover and the demo.
  - **Any scouting role sees every visible player**, whatever its coverage (`app.sees_player`, staff_reads
    migration). Coverage limits only competitions, matches and the metrics computed from them.
  - **`app.owns_player()` is used by about 25 policies**, including reading `player_identity`, updating `players`,
    and setting `consents.revoked_at`, which withdraws the player and queues `delete_personal_data`. It means "this
    is me or my child". Do not extend it to clubs.
  - `app.federation_players()` already includes every `squad_members` row of teams in competitions the federation
    owns, as well as line-ups.
  - Any scouting role can read every `squad_members` row (`covered` policy), and `lineups` has no player-visibility
    filter. Both would expose hidden club players once clubs add them.
  - Postgres functions are executable by `PUBLIC` by default, and no migration revokes it. The sign-up claim search
    (`app/signup/actions.ts`) runs without a login.
  - The registration number is `verifications.federation_registration`, one row per player. `seed_demo.py` fills it
    with random `FED-xxxxx` values, which can collide.
  - Each user has a single `app_users.org_id`.
  - `worker/test_rls.py` **skips itself** when the database is down or the demo seed is missing, so a run can look
    green with no security test run.
  - `squad_members(team_id, player_id, shirt_number)`. The match sheet only picks from it
    (`lib/match-sheet.ts validateSheet`). Row-level security already lets a coordinator write the squads of teams
    in their assigned matches (`app.coordinated_teams()`), but no screen writes it.
  - `match_assignments` has an admin-only write policy, but no screen writes it. Nothing in the app creates a
    competition, team or match.
  - Agents: `agent_clients.confirmed_at`, `app.confirm_agent()`, `app.represented_players()`. The pattern of
    "added by one side, confirmed by the other" is the model for club membership.
  - Claims: `profile_claims` and `app.decide_claim()`. Admin-approved. `app.claimable_players()` is a plain
    `ilike` on match-data players only.
  - Private files: ID documents upload through `app/verify/id-document/route.ts` and only admins can open them.
    Reuse that path for agent proof documents.
  - Menus: `apps/web/lib/nav.ts`. Sign-up types: `apps/web/lib/signup.ts` (`ACCOUNT_TYPES`).
  - **Every staff sign-up creates a new organisation** (`apps/web/lib/auth.ts signUp`: `insert into orgs` from the
    typed name). Nobody can join an existing organisation, and organisation names are not checked or unique.
    Scout-type sign-ups are active at once. Coordinators and analysts wait for an admin.
  - Demo data: `worker/seed_demo.py` uses deterministic ids (`did(...)`), labels everything `is_demo`, and
    `--remove` deletes it all.

## 2. Rules that do not bend

All of `BUILD_PROMPT.md` section 4 still applies, including: no competitor products, demo data always labelled
and removable, never fake match events, row-level security on every table, private data stays private, no paid
service required, and search, profile and compare keep working through every phase. In addition:

1. **Consent before exposure.** No player is shown to another organisation without consent: from the player, the
   guardian for an under-18, or the club's recorded consent tick for a player with no account. Under-18s still
   wait for admin approval, whoever created them. One exception: the federation that owns a competition may see
   and verify a hidden, unconsented player on a squad in that competition, because it is the official registration
   body. Nobody else outside the club may.
2. **Hidden means hidden.** A profile that is not visible to other clubs must not leak through any surface:
   search, find by role, similar players, compare, team and competition pages, the printed report and share link,
   playlists, exports, inbox, squad lists (`squad_members`), line-ups, likely-match checks, claim screens, counts
   or error messages. A player who withdrew
   consent stays hidden, and no club can turn their visibility back on. A likely-match result shown to someone who cannot
   see the profile shows only the club's name and "a player with this name and birth date is listed", and only on
   an **exact** date-of-birth match, so nobody can probe for hidden players (children above all) by name. Revoke
   `execute` from `public` and `anon` on every new function, and on `app.claimable_players`.
3. **Match stats belong to the match.** Leaving a club, merging profiles or withdrawing from a squad never deletes
   or changes events, line-ups or computed metrics, except that a merge moves them to the surviving profile.
4. **Every new rule is enforced in the database** (policy, grant or security-definer function), not only in the
   screen. Add a test in `worker/test_rls.py` for each.
5. **Do not deploy and do not touch the Render database.** The owner deploys.
6. **In-app notifications only.** No email or SMS service.
7. **A failed migration takes the live site down**, because `scripts/start.sh` runs `migrate.sh` under `set -e`.
   Every migration states its backfill of existing rows. Every new unique constraint first checks for existing
   duplicates and stops with a message that says which rows to fix.

## 3. Skills to use

As in `BUILD_PROMPT.md` section 3. In particular: `pstack:poteto-mode` for the whole job, `pstack:architect` for
the club membership model and the merge, `pstack:tdd` for the likely-match scoring, visibility rules and the merge,
`astryx` for every screen, `browse` for all browser work (never the `mcp__claude-in-chrome__*` tools), and the
end-of-phase checks in this order: `pstack:deslop`, `pstack:no-comments`, `verify`, `qa`, `design-review`,
`pstack:thermos`, `review`, then `cso` before the last phase closes.

## 4. What to build, in phases

At the end of each phase run the checks, fix what they find (up to three attempts per check), commit, add a
short report to `docs/build-log.md`, tick the items done in `docs/todo.md`, and go straight on.

### Phase 6: clubs and their players

The decisions are in `docs/todo.md` under "Clubs and their players". Build:

1. **One Club type.** Merge `academy` into `club` in a migration that converts existing rows. Every club gets the
   scouting tools and its own squad tools. Sign-up offers "Club or academy" staff types (scout, coach,
   coordinator) under one organisation kind. Coverage still decides which competitions, matches and metrics a
   club sees, and every scouting role still sees every visible player (section 1). A club always sees its own
   players, hidden or not.
2. **Joining a club and approving new clubs.**
   - Club staff invite colleagues with a link (single use, expires after 14 days, revocable) that they copy and
     send themselves, because Scout sends no email (rule 6). An invite can name an email address: only that
     address can use it, and if that person already has an account it shows in their "Needs you" list. Signing up
     through an invite puts the new user in that club. Coordinators and analysts still wait for an admin.
   - **An existing user can accept an invite and move.** Their old organisation keeps everything they wrote there
     (reports, shortlists, saved searches, profiles), and they lose access to it. The invite sets their role, which
     must suit the new organisation's kind: an agent invited to a club becomes club staff.
   - A sign-up without an invite creates a new club, which can scout at once but **cannot add players or show
     them to other clubs until a Scout admin approves the club**. Approval sits in the admin's Approvals screen.
     The migration marks every existing organisation approved.
   - An admin tool merges two duplicate organisations, **of the same kind only**. Move every row that points to
     the merged organisation, found from the catalogue, not a hand list. That includes staff, teams, memberships,
     coverage, scout reports, requirement profiles, shortlists, agent clients, profile shares (both ends),
     introduction requests and report links. A share link must still open after a merge.
   - Build a minimal "Needs you" list in this phase, for invites and club approvals. Phase 8 extends it.
   - Apply the same invite flow to agencies and federations, so colleagues can join them too.
3. **Club membership.** A table of player and club with a status: `added` (by the club), `confirmed`,
   `rejected`, `left`, and who did each step and when. The player, or the guardian for an under-18, confirms or
   rejects. Membership replaces `players.academy_org_id`. Give club staff their rights through a **new function**
   (for example `app.club_manages(pid)`), true for confirmed members and for added members with no account, and
   list each policy that uses it. Club staff may edit details and market facts, add tests, manage squads, and hold
   the visibility switch while the player has no account. They may **never** read `player_identity`, write
   `consents` or withdraw a player. The migration turns each existing `academy_org_id` link into a confirmed
   membership, then drops the column.
   - A player can belong to **several clubs at once**, such as a club and its academy, or a loan. One membership
     is the **current club**: the player or guardian chooses it, or, for a player with no account, it is the most
     recent club. Profiles and search show the current club.
   - **Removing a player:** if a club removes a player it created, and the player has no account, no match data
     and no other club, delete the profile and its personal data. Otherwise only the membership ends.
4. **Teams and squad screen** for club staff (any staff role at an approved club). The club creates its own
   teams (for example "First team" and "U20"), and each team has its squad. Add a player (name, date of birth,
   position, nationality, shirt number), edit, remove from the squad, remove from the club. Adding runs the
   likely-match check from phase 7 once it exists. Build the hook now and wire it in phase 7. This screen is the
   source of the match sheet's squad list. Narrow the existing coordinator squad write (`app.coordinated_teams()`):
   a coordinator writes the squad of their own club's teams, and of an opponent team only when that team belongs
   to no club on Scout.
5. **Visibility switch** for each player, "Show to other clubs" (a new column, section 1). The club holds it while the player has no
   account. Once a player or guardian account is linked, only they hold it. Turning it on for a player with no
   account requires the consent tick (rule 1), and stores who ticked it and when. For an under-18, the tick also
   records the guardian's name and contact, and the profile goes to admin approval.
6. **The player's side.** On the Account page: the clubs that list them, with Confirm, Reject and Leave this
   club, plus "View my profile" and "Edit my details" links (the `/players/[id]/market` gap).
7. **"My players"** for club staff: confirmed and added members, with status and visibility.
8. **Menus:** add "Squad" and "My players" for club staff, and "Matches" for analysts, coordinators and admins
   (`lib/nav.ts`).

### Phase 7: duplicates, claims and merging

The decisions are in `docs/todo.md` under "Duplicate players". Build:

1. **Likely-match search** in the database: `unaccent` and `pg_trgm` name similarity, plus the same birth date
   or year, plus nationality. For callers who cannot see a hidden profile, it returns that profile only on an
   exact date-of-birth match (rule 2). It returns a score and a reason. Unit-test it with real African name variants
   (Ismaila and Ismaïla, Mohamed and Mohammed, Kofi Mensah and Mensah Kofi, Nana Yaw and Yaw).
2. **Use it in three places:** the club's add-player form, player and guardian sign-up (replacing
   `app.claimable_players`), and an admin "Possible duplicates" list.
3. **Warn, allow override.** Show the likely matches. A new profile created anyway is flagged for admin review.
4. **Claims on club-created profiles.** At sign-up: "<club> has listed you. Is this you?", with the minimal
   details from rule 2. The club approves. The admin can decide if the club has not answered within 14 days, or
   if either side disputes it. Claims on match-data profiles stay admin-approved, as today.
5. **Admin merge tool.** Pick two profiles, see them side by side, choose the surviving one.
   - Move every row that points to the merged profile, found from the catalogue's foreign keys, not a hand list.
     That covers events, line-ups, metrics, squads, memberships, tests, market details, agent links, claims,
     verification, consents, profile views, shortlists, scout reports, report links, profile shares, introduction
     requests, playlist items, match-sheet entries and summaries.
   - On a one-row-per-player table (`player_identity`, `verifications`, `player_market`), and on a key collision
     (`lineups`, `squad_members`, `player_season_metrics`), the surviving profile's row wins.
   - Recompute the metrics afterwards. If either profile withdrew consent, the survivor is withdrawn. Refuse a
     demo survivor when the other profile is real, so `seed_demo.py --remove` can never delete real data.
   - Run it in one transaction, and record it in an audit table. Write tests that merge two seeded profiles and
     check that nothing is lost and no other player changes.
6. **Unique registration number:** a unique index on `verifications.federation_registration`, where it is not
   empty. The migration first checks for duplicates (rule 7), and `seed_demo.py` stops making random ones that
   can collide. A duplicate is refused with a message naming the problem, not the other player.

### Phase 8: players, guardians, agents and federations

1. **Handover at 18.** When a guardian-held player turns 18 (by `player_identity.date_of_birth`), the player can
   claim the profile. **A Scout admin approves** the handover, as with today's profile claims. On approval the
   guardian's control ends. Show the guardian and the player what is happening.
2. **A guardian adds another child** from the Account page, with the same form and rules as sign-up, including
   the likely-match check and admin approval.
3. **Agents send only confirmed clients.** Sending a profile, and the send screen, are limited to
   `app.represented_players()`. Enforce it in the `profile_shares` insert policy.
4. **Proof of representation.** An agency can upload its agent licence, and a representation contract for each
   client, as private files that only admins open (reuse the ID-document storage). When a player has no account,
   only an admin confirms the agent, and only with a contract on file. When the player or guardian confirms,
   the upload is optional. Record each upload in the database. On Render's free plan the files themselves are
   lost on restart, so say so in the deploy notes.
5. **In-app notifications.** A "Needs you" list and a count in the header, built from the existing tables, for:
   - an invite to join a club, agency or federation, and a new club waiting for approval (admin)
   - an agent asking to represent you (player or guardian)
   - a club saying you play for it (player or guardian)
   - a claim on your club's player (club staff)
   - a handover request (guardian)
   - possible duplicates, claims, approvals and agent confirmations waiting (admin)
   - your approval or claim decided (player or guardian)
6. **Federations.**
   - **Upload an official registration list** (CSV) for a team in a competition it owns. Nobody confirms each
     row, so link a row to an existing player **only** on the same registration number, or an exact name plus
     date of birth. Otherwise create a new player and flag the row as a possible duplicate. Add each to the squad
     and record the registration number.
     Players it creates follow rule 1 and stay hidden until consent. Document the CSV layout next to
     `docs/import-csv.md`.
   - **Verify sign-up players** who are members of a club whose team plays in a competition the federation owns,
     as well as the players it can verify today (`app.federation_players()`).

### Phase 9: data engine setup

1. **Create competitions, teams and matches.** The admin creates any of them, including a team for any club.
   Clubs already create their own teams (phase 6). A federation creates matches in competitions it owns. A new competition gets coverage through the existing Coverage
   screen.
2. **Assign staff to a match:** coordinator, analyst and reviewer, from active staff accounts. Assignment changes
   show on the staff member's `/matches` list at once.
3. **End to end, on a match created in the app:** a club builds its squad, the admin creates a match and assigns
   staff, the coordinator fills in the sheet and uploads a short video, an analyst logs events, a reviewer samples
   and publishes, and the metrics job runs. Write this as one Playwright test.

## 5. Demo data

Extend `seed_demo.py` so every new screen has content, all labelled `is_demo` and all removed by `--remove`:
- a club-created player with no account (hidden)
- a club-created player whose claim is waiting for the club
- a membership waiting for the player to confirm
- a possible-duplicate pair
- a guardian with two children, one of them 17 years and 11 months old
- an agent with a contract on file and one without
- a federation registration list already imported for one demo team
- a player in two clubs with one marked current, a pending invite, and a new club waiting for admin approval
- every existing demo login keeps working, and the README's demo login table is updated

## 6. Working rules for this run

These come from problems in the last run:
- **Never wait without a limit.** Every background process (dev server, Playwright, worker) gets a timeout, and
  every wait loop has a maximum. If something hangs, stop it, write down why, and move on.
- **Playwright exits at once if another `next dev` runs in `apps/web`.** Stop other dev servers first, or set
  `E2E_BASE_URL`. Run Playwright one file at a time.
- **Use subagents for wide, mechanical work** (deslop, no-comments, renaming the `academy` kind across the code),
  on a cheaper model where the skill allows. Keep design, security and the merge logic in the main session.
- **Run `/verify` before every commit.** Commit messages end with the attribution line from your environment.

## 7. Definition of done

`BUILD_PROMPT.md` section 6, plus:
- every migration applies to an empty database and to a database seeded with AFCON and `seed_demo.py`
- every item in `docs/todo.md` is ticked, or left open with the reason in the build log
- a new test in `worker/test_rls.py` for each new rule in section 2, and the existing tests still pass, with
  **zero skipped** (start the database and load the seed first)
- each new migration is mounted in `docker-compose.yml`, and `scripts/check-fresh-db.sh` passes
- `README.md` (demo logins, layout), `docs/standards/verification.md` and `docs/standards/match-sheet.md` describe
  the new flows, and a CSV layout for federation registration lists sits next to `docs/import-csv.md`

## 8. When you finish

Add one final report to `docs/build-log.md`: what each phase delivered, every check still red, every decision
you made, and the exact steps for the owner to deploy to Render, including what the migrations will do to the
live demo data.
