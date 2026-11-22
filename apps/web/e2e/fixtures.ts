// Shared by the end-to-end tests: sign-in, the demo match, and direct database access to check and clean up.
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54330/postgres", { max: 2, idle_timeout: 2 }) // closes itself when idle, so no test file has to end the shared pool;
export const PASSWORD = "scout-demo";

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The landing page can take a while to render on a busy dev server; the URL changes only once it has.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 60_000 });
}

export type Demo = { id: string; home_id: string; away_id: string; home: string };

/** The demo league's match, which the data-engine tools work on. */
export async function demoMatch(): Promise<Demo> {
  const [m] = await sql<Demo[]>`
    select m.id, m.home_team_id as home_id, m.away_team_id as away_id, t.name as home
    from matches m join competitions c on c.id = m.competition_id join teams t on t.id = m.home_team_id
    where c.is_demo order by m.kickoff_at limit 1`;
  if (!m) throw new Error("No demo match: run `uv run --python 3.12 python seed_demo.py` in worker/");
  return m;
}

/** Puts the demo match back as the seed left it, whatever a test created. */
export async function resetMatch(id: string) {
  await sql.begin(async (tx) => {
    for (const t of ["review_events", "qc_runs", "qc_samples", "imports", "match_sheet_events"]) await tx`delete from ${tx(t)} where match_id = ${id}`;
    await tx`delete from playlist_items where event_id in (select id from events where match_id = ${id})`;
    await tx`delete from events where match_id = ${id}`;
    await tx`delete from lineups where match_id = ${id}`;
    await tx`update matches set status = 'uploaded', periods = '[]', sheet_submitted_at = null where id = ${id}`;
  });
}

/** A filled match sheet for both teams, written directly: shirts 1 to 11 start, 12 to 16 on the bench. */
export async function seedLineups(m: Demo) {
  await sql`
    insert into lineups (match_id, team_id, player_id, shirt_number, position, started, minutes_played)
    select ${m.id}, s.team_id, s.player_id, s.shirt_number, p.primary_position, s.shirt_number <= 11, case when s.shirt_number <= 11 then 90 else 0 end
    from squad_members s join players p on p.id = s.player_id where s.team_id in (${m.home_id}, ${m.away_id})`;
}
