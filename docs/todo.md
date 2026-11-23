# To do

Gaps found while walking through each user role. Fix after the walkthrough.

## Agents and representation
- [ ] An agent can send any visible player's profile to a club, not only a confirmed client. Allow only confirmed
      clients, or show "confirmed client" in the club's Inbox.
- [ ] No proof of representation. Add an upload for the representation contract and the agent's licence, shown to
      the admin before confirming.
- [ ] Match-data players (all of AFCON) have no account, so only an admin can confirm their agent, with nothing to
      check against. Covered by the upload above.
- [ ] No notification when an agent asks to represent a player. The player only sees it on the Account page.

## Clubs and their players (decided 2026-11-23)
Today no club can add players, and African clubs exist only as team names. Decisions:
- **One Club type.** No buying club versus selling club. Any club, in Africa or Europe, can scout other players
  and manage its own squad. Academies become clubs too (labelled "club or academy").
- **Any staff member at the club** (scout, coach or coordinator) can add and remove the club's players.
- **Linking:** the club adds a player. If the player has an account, or signs up later, they see "<club> says you
  play for us" and confirm or reject it, like confirming an agent. Under-18s: the guardian confirms.
- **Visibility to other clubs:** the club decides while the player has no account. Once the player has an account
  and is linked, the player decides.
- **Leaving:** a player can remove themselves from a club, and a club can remove a player. Match stats stay, because
  they belong to the matches played.

- **Joining a club:** today every sign-up creates a new organisation (`lib/auth.ts signUp`), so two scouts from
  one club end up in two clubs. Club staff invite colleagues with a link they send themselves (Scout sends no email), and
  the invite puts them in the same club. A sign-up without an invite creates a new club.
- **New clubs are checked:** a new club can scout straight away, but cannot add players or show them to other
  clubs until a Scout admin approves it. The admin can merge two duplicate clubs.
- **Removing a player:** if a club removes a player it created, who has no account, no match data and no other
  club, the profile and its personal data are deleted. Otherwise the profile stays.
- **More than one club:** a player can belong to several clubs at once (a club and its academy, a loan). One is
  marked the current club: chosen by the player or guardian, or, for a player with no account, the most recent club.
- **An existing user invited to another organisation** can accept and move. The old organisation keeps what they
  wrote there, and they lose access to it.
- **Federations see hidden club players** on squads in competitions they own, and may verify them before consent.
  Nobody else outside the club sees them.

To build:
- [ ] Club invite links, and admin approval of new clubs before they manage squads, with an admin
      tool to merge duplicate clubs.
- [ ] Merge the `club` and `academy` organisation kinds into one Club type with scouting and squad tools, and update
      the sign-up types, menus (`apps/web/lib/nav.ts`) and row-level security to match.
- [ ] A squad screen for the club: add a player (name, date of birth, position, shirt number), edit, remove.
      It also gives the match sheet its squad list, which today comes only from `seed_demo.py`.
- [ ] Club membership with a status: added by the club, confirmed or rejected by the player or guardian, left.
      This replaces `players.academy_org_id` (today set only by `seed_demo.py`), so a coach's rights come from it.
- [ ] A visibility switch for each player ("show to other clubs"), held by the club until the player has an
      account, then by the player.
- [ ] Safeguard to confirm: before a club shows a player without an account, the club ticks that it has the player's
      consent (or the guardian's for an under-18). Under-18s still wait for admin approval. Without this, a club
      could publish a child's profile with no consent, which breaks the current consent rule.
- [ ] On the player's Account page: the clubs that list them, with Confirm, Reject and "Leave this club".
- [ ] A "my players" list for club staff (replaces the coach item below).

## Duplicate players (decided 2026-11-23)
Today only match data is de-duplicated, by the provider's player id. Sign-up only suggests claiming a match-data
profile (`app.claimable_players`: exact text, no accents or spelling variants) and can be skipped. Only the email is
unique, so one player can have two profiles. Decisions:
- **Likely-match check** whenever a club or a player creates a profile: a similar name (accents and spelling
  variants, such as Ismaila and Ismaïla, Mohamed and Mohammed) plus the same date or year of birth, and nationality.
- **Warn, allow override:** show the likely matches. They can still create a new profile, which is flagged for an
  admin to review as a possible duplicate.
- **Claiming a club-created profile:** at sign-up the player sees "<club> has listed you. Is this you?" with only
  minimal details, because the profile may be hidden. **The club approves** the claim. The admin steps in if the
  club does not answer or there is a dispute.
- **Admin merge tool:** combine two profiles of the same player. Stats, clubs, tests, agent links, claims and
  verification move to one profile, and the other is removed.

To build:
- [ ] The likely-match search (Postgres `unaccent` plus `pg_trgm` similarity, with birth date or year and nationality).
- [ ] Use it in the club's add-player form, in player and guardian sign-up, and in the admin's possible-duplicates list.
- [ ] Claims on club-created profiles, approved by the club, with an admin fallback.
- [ ] Admin merge tool.
- [ ] Make the federation registration number unique, so no two profiles can share one.

## Federations
- [ ] A federation cannot add players, teams or squad lists. Let it upload its official registration list as the
      squad lists of its competitions (this also covers the squad-list screen above).
- [ ] A federation can verify only players in its own competitions' line-ups or squads (`app.federation_players()`).
      Sign-up players outside those, the ones whose age most needs checking, can be verified only by an admin.

## Academy coaches
Covered by "Clubs and their players" above: club membership replaces the academy link, and the "my players" list
covers the coach.

## Players and guardians
- [ ] The Account page has no link to the player's own profile or its edit page (`/players/[id]/market`). The
      database lets a player edit height, foot, contract, availability and add tests, but the only way in is
      typing the URL. Add "View my profile" and "Edit my details" links.
- [ ] Nothing happens when a child turns 18. The guardian keeps control and the player cannot take over. Add a
      handover: at 18 (by date of birth) the player claims the profile, a Scout admin approves, and the guardian's
      control ends. (Decided 2026-11-23: admin approves.)
- [ ] A guardian adds a child only at sign-up. A guardian with two children cannot add the second one later.

## Data engine setup
- [ ] No screen creates a competition, a team or a match. Today they come only from `load_statsbomb.py` or
      `seed_demo.py`, so the data-engine tools work only on the demo match.
- [ ] No screen assigns a coordinator, analyst or reviewer to a match (`match_assignments` is written only by
      `seed_demo.py`). The empty /matches page tells staff to ask an admin, but the admin has no way to do it.

## Staff
- [ ] Analysts, coordinators and admins have no menu link to /matches (`apps/web/lib/nav.ts`). They must type the URL.
