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
