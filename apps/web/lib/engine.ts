// Every query runs inside the caller's db() transaction, so row-level security decides what the user sees and may change.
import { dirname, join } from "node:path";
import { notFound, redirect } from "next/navigation";
import { db, me, requireMe, type Me, type Q } from "./auth";
import type { Period } from "./qc.ts";
import { videoDir } from "./video.ts";

export const STAFF = ["coordinator", "tagger", "admin"];
export type Task = "coordinator" | "analyst" | "reviewer";
export type Status = "uploaded" | "tagging" | "review" | "published";

export type Match = {
  id: string; status: Status; kickoff_at: Date | null; competition: string; season: string; is_demo: boolean;
  home_id: string; home: string; away_id: string; away: string;
  video_provider: "local" | "mux" | null; video_path: string | null; video_status: string | null; video_size: string | null;
  mux_playback_id: string | null; periods: Period[]; sheet_submitted_at: Date | null;
};

export async function getMatch(tx: Q, id: string): Promise<Match | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [m] = await tx<Match[]>`
    select m.id, m.status, m.kickoff_at, c.name as competition, c.season, m.is_demo,
           m.home_team_id as home_id, h.name as home, m.away_team_id as away_id, a.name as away,
           m.video_provider, m.video_path, m.video_status, m.video_size, m.mux_playback_id, m.periods, m.sheet_submitted_at
    from matches m join competitions c on c.id = m.competition_id
    join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id
    where m.id = ${id}`;
  return m ?? null;
}

async function tasksFor(tx: Q, matchId: string, user: Me): Promise<Set<Task>> {
  if (user.role === "admin") return new Set(["coordinator", "analyst", "reviewer"]);
  const rows = await tx<{ task: Task }[]>`select task from match_assignments where match_id = ${matchId} and user_id = ${user.id}`;
  return new Set(rows.map((r) => r.task));
}

export type MatchPlayer = { player_id: string; team_id: string; shirt_number: number | null; display_name: string; position: string | null; on_sheet: boolean };

/** The players of a match: the sheet's line-ups, or both squads while the sheet is still empty. */
export async function matchPlayers(tx: Q, m: Pick<Match, "id" | "home_id" | "away_id">): Promise<MatchPlayer[]> {
  const sheet = await tx<MatchPlayer[]>`
    select l.player_id, l.team_id, l.shirt_number, p.display_name, l.position, true as on_sheet
    from lineups l join players p on p.id = l.player_id where l.match_id = ${m.id}
    order by l.team_id, l.shirt_number nulls last`;
  if (sheet.length) return sheet;
  return tx<MatchPlayer[]>`
    select s.player_id, s.team_id, s.shirt_number, p.display_name, p.primary_position as position, false as on_sheet
    from squad_members s join players p on p.id = s.player_id where s.team_id in (${m.home_id}, ${m.away_id})
    order by s.team_id, s.shirt_number nulls last`;
}

export const exportDir = (matchId: string) => join(dirname(videoDir()), "exports", matchId);

export const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Route handlers answer with a status instead of redirecting to sign-in, so a phone's send queue or an upload loop
 * can never mistake the sign-in page for a success.
 */
export async function apiUser(roles: string[]): Promise<Me | Response> {
  const user = await me();
  if (!user || !user.active) return json({ error: "Sign in again." }, 401);
  if (!roles.includes(user.role)) return json({ error: "Your role cannot do this." }, 403);
  return user;
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export async function loadTool(id: string, needs: Task[]): Promise<{ user: Me; match: Match; tasks: Set<Task> }> {
  const user = await requireMe(STAFF);
  const found = await db(async (tx) => {
    const match = await getMatch(tx, id);
    return match && { match, tasks: await tasksFor(tx, id, user) };
  });
  if (!found) notFound();
  if (!needs.some((t) => found.tasks.has(t))) redirect("/matches");
  return { user, ...found };
}
