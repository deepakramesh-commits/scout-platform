// One team's match sheet from the coordinator's phone. The phone sends the whole sheet each time with ids it made,
// so a resend after a dropped connection converges on the same rows instead of adding them twice.
import { db } from "@/lib/auth";
import { apiUser, getMatch, json } from "@/lib/engine";
import { minutesPlayed, validateSheet } from "@/lib/match-sheet";
import { parseSheetBody } from "@/lib/sheet-sync";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(["coordinator", "admin"]);
  if (user instanceof Response) return user;
  const { id } = await params;
  const parsed = parseSheetBody(await req.json().catch(() => null));
  if (!parsed.ok) return json({ errors: parsed.errors.map((message) => ({ field: "sheet", message })) }, 422);
  const { team_id, sheet } = parsed.value;

  return db(async (tx) => {
    const match = await getMatch(tx, id);
    if (!match) return json({ error: "No such match." }, 404);
    if (team_id !== match.home_id && team_id !== match.away_id) return json({ error: "That team is not in this match." }, 422);
    const [{ ok }] = await tx<{ ok: boolean }[]>`select app.assigned(${id}, 'coordinator') as ok`;
    if (!ok) return json({ error: "You are not the coordinator for this match." }, 403);
    const squad = await tx<{ player_id: string; shirt_number: number | null }[]>`select player_id, shirt_number from squad_members where team_id = ${team_id}`;
    const errors = validateSheet(sheet, squad);
    if (errors.length) return json({ errors }, 422);

    const minutes = minutesPlayed(sheet);
    const players = sheet.lineup.map((l) => l.player_id);
    const entryIds = sheet.entries.map((e) => e.id);
    await tx`delete from match_sheet_events where match_id = ${id} and team_id = ${team_id} and not (id = any(${entryIds}::uuid[]))`;
    await tx`delete from lineups where match_id = ${id} and team_id = ${team_id} and not (player_id = any(${players}::uuid[]))`;
    if (sheet.lineup.length) {
      await tx`
        insert into lineups ${tx(sheet.lineup.map((l) => ({
          match_id: id, team_id, player_id: l.player_id, shirt_number: l.shirt_number, position: l.position, started: l.started,
          minutes_played: minutes[l.player_id] ?? 0, sheet_submitted_by: user.id,
        })))}
        on conflict (match_id, player_id) do update set team_id = excluded.team_id, shirt_number = excluded.shirt_number,
          position = excluded.position, started = excluded.started, minutes_played = excluded.minutes_played,
          sheet_submitted_by = excluded.sheet_submitted_by`;
    }
    if (sheet.entries.length) {
      await tx`
        insert into match_sheet_events ${tx(sheet.entries.map((e) => ({
          id: e.id, match_id: id, team_id, kind: e.kind, minute: e.minute!, player_id: e.player_id, player_in_id: e.player_in_id, submitted_by: user.id,
        })))}
        on conflict (id) do update set kind = excluded.kind, minute = excluded.minute, player_id = excluded.player_id,
          player_in_id = excluded.player_in_id, submitted_by = excluded.submitted_by
        where match_sheet_events.match_id = excluded.match_id`;
    }
    const [{ sent_at }] = await tx<{ sent_at: Date }[]>`update matches set sheet_submitted_at = now() where id = ${id} returning sheet_submitted_at as sent_at`;
    return json({ ok: true, sent_at, players: sheet.lineup.length, entries: sheet.entries.length });
  });
}
