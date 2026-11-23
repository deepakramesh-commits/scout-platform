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

- HEAD is `eb6de11` or later, on `main`, pushed to a private GitHub repository. pytest 107, `npm test` 111,
  Playwright 13 of 13, `npm run build` and `npx astryx doctor` pass.
- A staging copy runs on Render (free plan) at https://scout-fodc.onrender.com with AFCON 2023 and the full
  `seed_demo.py` data. `scripts/start.sh` runs `scripts/migrate.sh` on every start, so **every new migration will
  run against that live database on the next deploy**. Write each migration to be safe on existing data, and test
  it against a copy of a seeded database as well as an empty one.
- Facts you will build on, so you do not rediscover them:
  - `orgs.kind` is one of `club`, `agency`, `federation`, `academy`, `internal`. Buying clubs are `club`. African
    clubs exist only as `teams` rows, linked to an organisation by `teams.org_id`. In the demo that organisation is
    an `academy`.
  - `players.academy_org_id` gives an academy "ownership" through `app.owns_player()`. Only `seed_demo.py` sets it.
  - `players.visible_to_scouts`, `players.status` (`live`, `pending_approval`, `declined`, `withdrawn`) and the
    `app_age_rule` trigger decide who is shown. Under-18s wait for admin approval.
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
  - Demo data: `worker/seed_demo.py` uses deterministic ids (`did(...)`), labels everything `is_demo`, and
    `--remove` deletes it all.

## 2. Rules that do not bend

All of `BUILD_PROMPT.md` section 4 still applies, including: no competitor products, demo data always labelled
and removable, never fake match events, row-level security on every table, private data stays private, no paid
service required, and search, profile and compare keep working through every phase. In addition:

1. **Consent before exposure.** No player is shown to another organisation without consent: from the player, the
   guardian for an under-18, or the club's recorded consent tick for a player with no account. Under-18s still
   wait for admin approval, whoever created them.
2. **Hidden means hidden.** A profile that is not visible to other clubs must not leak through any search,
   likely-match check, claim screen, count or error message. A likely-match result shown to someone who cannot
   see the profile shows only the club's name and "a player with this name and birth date is listed".
3. **Match stats belong to the match.** Leaving a club, merging profiles or withdrawing from a squad never deletes
   or changes events, line-ups or computed metrics, except that a merge moves them to the surviving profile.
4. **Every new rule is enforced in the database** (policy, grant or security-definer function), not only in the
   screen. Add a test in `worker/test_rls.py` for each.
5. **Do not deploy and do not touch the Render database.** The owner deploys.
6. **In-app notifications only.** No email or SMS service.

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
   coordinator) under one organisation kind. What a club sees of other players is still decided by coverage. A
   club always sees its own players.
2. **Club membership.** A table of player and club with a status: `added` (by the club), `confirmed`,
   `rejected`, `left`, and who did each step and when. The player, or the guardian for an under-18, confirms or
   rejects. Membership replaces `players.academy_org_id`: `app.owns_player()` (or its replacement) grants a club's
   staff the coach rights only for confirmed members, and for added members who have no account.
3. **Squad screen** for club staff (any staff role at the club): the club's teams, and for each team its squad.
   Add a player (name, date of birth, position, nationality, shirt number), edit, remove from the squad, remove
   from the club. Adding runs the likely-match check from phase 7 once it exists. Build the hook now and wire it in
   phase 7. This screen is the source of the match sheet's squad list.
4. **Visibility switch** for each player, "Show to other clubs". The club holds it while the player has no
   account. Once a player or guardian account is linked, only they hold it. Turning it on for a player with no
   account requires the consent tick (rule 1), and stores who ticked it and when. Under-18s go to admin approval.
5. **The player's side.** On the Account page: the clubs that list them, with Confirm, Reject and Leave this
   club, plus "View my profile" and "Edit my details" links (the `/players/[id]/market` gap).
6. **"My players"** for club staff: confirmed and added members, with status and visibility.
7. **Menus:** add "Squad" and "My players" for club staff, and "Matches" for analysts, coordinators and admins
   (`lib/nav.ts`).

### Phase 7: duplicates, claims and merging

The decisions are in `docs/todo.md` under "Duplicate players". Build:

1. **Likely-match search** in the database: `unaccent` and `pg_trgm` name similarity, plus the same birth date
   or year, plus nationality. It returns a score and a reason. Unit-test it with real African name variants
   (Ismaila and Ismaïla, Mohamed and Mohammed, Kofi Mensah and Mensah Kofi, Nana Yaw and Yaw).
2. **Use it in three places:** the club's add-player form, player and guardian sign-up (replacing
   `app.claimable_players`), and an admin "Possible duplicates" list.
3. **Warn, allow override.** Show the likely matches. A new profile created anyway is flagged for admin review.
4. **Claims on club-created profiles.** At sign-up: "<club> has listed you. Is this you?", with the minimal
   details from rule 2. The club approves. The admin can decide if the club has not answered within 14 days, or
   if either side disputes it. Claims on match-data profiles stay admin-approved, as today.
5. **Admin merge tool.** Pick two profiles, see them side by side, choose the surviving one. Events, line-ups,
   metrics, squads, memberships, tests, market details, agent links, claims, verification, consents and profile
   views move to it, then the other is removed. Run it in one transaction, and record it in an audit table. Write
   tests that merge two seeded profiles and check that nothing is lost and no other player changes.
6. **Unique federation registration number** across profiles. A duplicate is refused with a message naming the
   problem, not the other player.

### Phase 8: players, guardians, agents and federations

1. **Handover at 18.** When a guardian-held player turns 18 (by date of birth), the player can claim the
   profile. The guardian approves, or the admin if the guardian has not answered within 14 days. On approval the
   guardian's control ends. Show the guardian and the player what is happening.
2. **A guardian adds another child** from the Account page, with the same form and rules as sign-up, including
   the likely-match check and admin approval.
3. **Agents send only confirmed clients.** Sending a profile, and the send screen, are limited to
   `app.represented_players()`. Enforce it in the `profile_shares` insert policy.
4. **Proof of representation.** An agency can upload its agent licence, and a representation contract for each
   client, as private files that only admins open (reuse the ID-document storage). When a player has no account,
   only an admin confirms the agent, and only with a contract on file. When the player or guardian confirms,
   the upload is optional.
5. **In-app notifications.** A "Needs you" list and a count in the header, built from the existing tables, for:
   - an agent asking to represent you (player or guardian)
   - a club saying you play for it (player or guardian)
   - a claim on your club's player (club staff)
   - a handover request (guardian)
   - possible duplicates, claims, approvals and agent confirmations waiting (admin)
   - your approval or claim decided (player or guardian)
6. **Federations.**
   - **Upload an official registration list** (CSV) for a team in a competition it owns. Each row creates or
     links a player through the likely-match check, adds them to the squad, and records the registration number.
     Players it creates follow rule 1 and stay hidden until consent. Document the CSV layout next to
     `docs/import-csv.md`.
   - **Verify sign-up players** who are members of a club whose team plays in a competition the federation owns,
     as well as the players it can verify today (`app.federation_players()`).

### Phase 9: data engine setup

1. **Create competitions, teams and matches.** The admin creates any of them. A federation creates matches in
   competitions it owns. A team links to a club. A new competition gets coverage through the existing Coverage
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
- a new test in `worker/test_rls.py` for each new rule in section 2, and the existing tests still pass

## 8. When you finish

Add one final report to `docs/build-log.md`: what each phase delivered, every check still red, every decision
you made, and the exact steps for the owner to deploy to Render, including what the migrations will do to the
live demo data.
