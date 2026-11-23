# Prompt: the Scout overview document for a partner

Paste everything below the line into a new Claude Code session opened in the `scout-platform` folder.

---

Write a shareable document about Scout for a **non-technical business partner**. Make it a Claude doc (the Claude
Docs connector), not a local file, and give me the link at the end. It stays private until I share it.

**The reader** is a smart partner who is not a developer and not a football analyst. They will use the document to
understand the product, and to talk to clubs about giving us their data. Use plain words, short sentences and
tables. No code, file names or database terms. Explain football-data words the first time they appear (for example
"event data", "per 90", "percentile").

**Read these first, and take every fact from them, not from memory:**
1. `README.md`, and the final report at the end of `docs/build-log.md`: what is built today.
2. `docs/todo.md` and `BUILD_PROMPT_2.md`: what is being built next, with the decisions already made.
3. `docs/standards/filming.md`, `match-sheet.md`, `event-definitions.md`, `quality-check.md`, `verification.md`:
   the rules for filming, the match sheet, logging and checking.
4. `docs/import-csv.md`, `apps/web/lib/event-spec.ts` (the event types and outcomes), `worker/metrics.py` (the
   statistics we compute), `apps/web/lib/market-form.ts` (the physical tests and their units), and the settings
   for the quality check (90% agreement, 3 seconds, 10 pitch units, 15-minute sample).
5. `docs/technical-plan.md` and `docs/business-plan.pdf`: the product, users and revenue.
6. The data-requirements sheet I already have: https://claude.ai/artifact/VbYXTaqK83SrXyXKUE9xGH (read it with
   the Artifact tool). Reuse its content. Do not contradict it. Where the code says something different, the code
   wins, and you tell me what differed.

**Sections, in this order:**

1. **Scout in one page.** What it is, who pays, and how video becomes data that clubs trust.
2. **How it works, start to finish.** One simple flow: a club films a match, the coordinator sends the match sheet
   and video, an analyst logs it, a second analyst checks a sample, and the match is published. Then the numbers
   reach scouts, agents and federations.
3. **The roles.** One short part each for club staff (scout, coach and coordinator, under the new one-club
   model), agent, federation, analyst, player, guardian and admin: who they are, what they want, what they can do
   today, and what is coming. Mark every planned feature **Coming soon**.
4. **Features: today and coming soon.** One table grouped by area (finding players, judging players, workflow,
   accounts and trust, the data engine, clubs and squads, duplicates). Have a status column: Live or Coming soon.
5. **The data we need from a club.** Say clearly that AFCON 2023 was free test data, and that real clubs are
   where the real data comes from. Then give tables:
   - **For each match:** the video (the filming standard in plain words: camera position, height, what must stay
     in view, resolution, full 90 minutes and both halves) and the match sheet (line-ups, shirt numbers, positions,
     substitutions, goals and cards with minutes).
   - **For each player:** legal name, date of birth, nationality, position, shirt number, height, preferred foot,
     photo, contract end, availability, federation registration number, an ID document for verification, a
     guardian for under-18s, and consent. Mark each one required or optional, and say who provides it (club,
     player, guardian or federation).
   - **Physical tests:** each test, how to run it simply at a club, the unit and the normal range.
   - **For the club:** the squad list, staff contacts, and who signs the consent forms.
6. **SOP for a club.** A step-by-step checklist a club with no data experience can follow: before the season
   (squad list, consent forms, ID copies, physical tests), before each match (camera, battery, storage, position),
   on match day (filming, match sheet on a phone), and after the match (upload the video within a set time).
   Include what goes wrong most often and how to avoid it.
7. **What the analyst does.** In plain words: what an "event" is, the event types and outcomes they record, how
   each is tied to a player, a place on the pitch and a moment in the video, and how the second-analyst check
   works. Work out how many events a match has from the AFCON data (160,230 events in 52 matches), and say what
   that means for analyst time. Label any time estimate as an estimate.
8. **What comes out.** The statistics and attributes a club gets for each player, explained simply. Explain why a
   player needs enough minutes before being ranked (the minimum-minutes setting), and how many full matches that
   means.
9. **What makes a good demo for one real club.** A concrete checklist: how many matches, from which league, which
   player data, which tests and consents, and what the finished demo shows a buying club. Say what is the minimum
   and what is better.
10. **Try it.** The demo site https://scout-fodc.onrender.com with only the scout login (`scout@demo.scout`,
    password `scout-demo`). Say that the free site sleeps when idle and takes about a minute to wake, and that
    the data there is AFCON test data plus labelled demo values.

**Rules:**
- Never recommend a competitor's product. Hudl, Wyscout, Sportscode and Hudl cameras are competitors. For
  filming equipment, describe what is needed (a phone or camera on a tripod, height, angle, storage), not a brand
  from those companies.
- Every number comes from the files above. If you cannot find one, say "to be confirmed".
- Keep it readable in about 15 minutes. Put detailed tables in an appendix if a section gets long.
- When done, give me the link and a five-line summary of what is in it, plus anything in the sources that
  contradicted each other.
