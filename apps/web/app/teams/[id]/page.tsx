import { notFound } from "next/navigation";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting, type Q } from "@/lib/auth";
import { matchRows } from "@/lib/competition";
import { UUID } from "@/lib/input";
import { ROLE_NAMES } from "@/lib/metrics";
import { MatchList } from "../../match-list";
import { PageHead, PlayerCell } from "../../page-kit";
import { flag } from "../../ui";

export const dynamic = "force-dynamic";

type Member = { id: string; display_name: string; id_verified: boolean; primary_position: string | null; is_demo: boolean; shirt: number | null; apps: number; minutes: number };
const POSITION_ORDER = Object.keys(ROLE_NAMES);

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScouting();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return db((tx) => TeamView(tx, id));
}

async function TeamView(tx: Q, id: string) {
  const [team] = await tx<{ name: string; country: string }[]>`select name, country from teams where id = ${id}`;
  if (!team) notFound();
  const [squad, matches] = await Promise.all([
    tx<Member[]>`
      with members as (
        select player_id, shirt_number from squad_members where team_id = ${id}
        union select player_id, null from lineups where team_id = ${id}
      )
      select p.id, p.display_name, p.id_verified, p.primary_position, p.is_demo, max(mb.shirt_number) as shirt,
             (select count(*)::int from lineups l where l.player_id = p.id and l.team_id = ${id} and l.minutes_played > 0) as apps,
             (select coalesce(sum(l.minutes_played), 0)::int from lineups l where l.player_id = p.id and l.team_id = ${id}) as minutes
      from members mb join players p on p.id = mb.player_id
      group by p.id order by p.display_name`,
    matchRows(tx, { team: id }),
  ]);
  const ordered = [...squad].sort((a, b) => {
    const pos = (m: Member) => { const i = POSITION_ORDER.indexOf(m.primary_position ?? ""); return i < 0 ? 99 : i; };
    return pos(a) - pos(b) || b.minutes - a.minutes;
  });

  return (
    <VStack gap={6}>
      <PageHead title={`${flag(team.name)} ${team.name}`} intro={`${team.country} · ${squad.length} players · ${matches.length} matches in competitions your plan includes`} />
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={3}>
            <Heading level={3}>Squad</Heading>
            {ordered.length === 0 ? <EmptyState isCompact title="No squad yet" description="Players appear when a squad list or a match sheet is entered." /> : (
              <Table density="compact" style={{ minWidth: "26rem" }}>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell style={{ width: "10%" }}>#</TableHeaderCell>
                    <TableHeaderCell>Player</TableHeaderCell>
                    <TableHeaderCell><Text type="inherit" display="block" justify="end">Apps</Text></TableHeaderCell>
                    <TableHeaderCell><Text type="inherit" display="block" justify="end">Minutes</Text></TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell><Text type="supporting" hasTabularNumbers>{m.shirt ?? "–"}</Text></TableCell>
                      <TableCell><PlayerCell p={{ ...m, position: m.primary_position && ROLE_NAMES[m.primary_position] }} /></TableCell>
                      <TableCell><Text display="block" justify="end" hasTabularNumbers>{m.apps}</Text></TableCell>
                      <TableCell><Text display="block" justify="end" hasTabularNumbers>{m.minutes}</Text></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </VStack>
        </Card>
        <Card>
          <VStack gap={3}>
            <Heading level={3}>Matches</Heading>
            {matches.length === 0 ? <EmptyState isCompact title="No matches in your plan" description="This team's matches are in competitions your subscription does not include, or none are scheduled yet." /> : <MatchList matches={matches} />}
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
