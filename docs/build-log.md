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
