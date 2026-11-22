import { VStack } from "@astryxdesign/core/VStack";
import { db, type Q } from "@/lib/auth";
import { loadTool } from "@/lib/engine";
import type { Sheet } from "@/lib/match-sheet";
import { sheetFromRows, type LineupRow, type SheetEventRow } from "@/lib/sheet-sync";
import { MatchHeader } from "../match-header";
import { SheetForm, type SheetTeam } from "./sheet-form";

export const dynamic = "force-dynamic";

async function team(tx: Q, matchId: string, id: string, name: string): Promise<SheetTeam> {
  const [squad, lineups, events] = await Promise.all([
    tx<SheetTeam["squad"]>`
      select s.player_id, p.display_name as name, s.shirt_number, p.primary_position as position
      from squad_members s join players p on p.id = s.player_id where s.team_id = ${id}
      order by s.shirt_number nulls last, p.display_name`,
    tx<LineupRow[]>`select player_id, shirt_number, position, started, minutes_played from lineups where match_id = ${matchId} and team_id = ${id}`,
    tx<SheetEventRow[]>`select id, kind, minute, player_id, player_in_id from match_sheet_events where match_id = ${matchId} and team_id = ${id} order by minute, created_at`,
  ]);
  const stored: Sheet | null = lineups.length ? sheetFromRows(lineups, events) : null;
  return { id, name, squad, stored };
}

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { match } = await loadTool(id, ["coordinator"]);
  const teams = await db((tx) => Promise.all([team(tx, id, match.home_id, match.home), team(tx, id, match.away_id, match.away)]));
  return (
    <VStack gap={5} maxWidth={720}>
      <MatchHeader match={match} tool="Match sheet" intro="Pick each team's starters and substitutes from the squad, then add substitutions, goals and cards. Everything is kept on this phone and sent when you have a connection." />
      <SheetForm matchId={id} teams={teams} sentAt={match.sheet_submitted_at?.toISOString() ?? null} />
    </VStack>
  );
}
