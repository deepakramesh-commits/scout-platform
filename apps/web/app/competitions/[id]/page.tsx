import { notFound } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Table, TableBody, TableCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting, type Q } from "@/lib/auth";
import { matchRows } from "@/lib/competition";
import { UUID } from "@/lib/input";
import { fmtMetric, label } from "@/lib/metrics";
import { MatchList } from "../../match-list";
import { PageHead } from "../../page-kit";
import { Demo, flag } from "../../ui";
import { VerifiedMark } from "../../verified";

export const dynamic = "force-dynamic";

type Competition = { id: string; name: string; season: string; country: string; min_minutes: number; is_demo: boolean; covered: boolean; owner: boolean };
type Team = { id: string; name: string; players: number };
type Leader = { id: string; display_name: string; id_verified: boolean; value: number };

const LEADERS = [
  { key: "goals", total: true },
  { key: "xg", total: false },
  { key: "progressive_passes", total: false },
  { key: "ball_recoveries", total: false },
] as const;

export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScouting();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return db((tx) => CompetitionView(tx, id));
}

async function CompetitionView(tx: Q, id: string) {
  const [c] = await tx<Competition[]>`
    select c.id, c.name, c.season, c.country, c.min_minutes, c.is_demo, c.id in (select app.covered_competitions()) as covered,
           exists (select 1 from org_coverage oc where oc.competition_id = c.id and oc.org_id = (select app.org()) and oc.owner) as owner
    from competitions c where c.id = ${id}`;
  if (!c) notFound();
  const title = `${c.name} ${c.season}`;
  if (!c.covered) {
    return (
      <VStack gap={6}>
        <PageHead title={title} intro={c.country} />
        <Card><EmptyState title="Not in your plan" description="Your subscription does not include this competition, so its matches and statistics are hidden. Ask us to add it." actions={<Button label="All competitions" href="/competitions" />} /></Card>
      </VStack>
    );
  }
  const [matches, teams, leaders] = await Promise.all([
    matchRows(tx, { competition: id }),
    tx<Team[]>`
      select t.id, t.name, (select count(distinct l.player_id)::int from lineups l join matches m on m.id = l.match_id where l.team_id = t.id and m.competition_id = ${id}) as players
      from teams t where t.id in (select unnest(array[home_team_id, away_team_id]) from matches where competition_id = ${id}) order by t.name`,
    Promise.all(LEADERS.map(({ key, total }) => tx<Leader[]>`
      select p.id, p.display_name, p.id_verified,
             ${total ? tx`sum((m.per90 ->> ${key})::float8 * m.minutes / 90)` : tx`max((m.per90 ->> ${key})::float8)`} as value
      from player_season_metrics m join players p on p.id = m.player_id
      where m.competition_id = ${id} and p.visible_to_scouts and m.minutes >= ${c.min_minutes} and m.per90 ? ${key}
      group by p.id order by value desc nulls last, p.display_name limit 5`)),
  ]);
  const published = matches.filter((m) => m.status === "published").length;

  return (
    <VStack gap={6}>
      <PageHead title={title}
        intro={`${c.country} · ${matches.length} matches, ${published} published · ${teams.length} teams. Statistics come only from published matches.`}
        actions={<HStack gap={1}>{c.owner && <Token color="purple" label="Your competition" />}{c.is_demo && <Demo />}</HStack>} />

      <Card>
        <VStack gap={3}>
          <Heading level={3}>Leaders</Heading>
          <Text type="supporting">Players with at least {c.min_minutes} minutes. Goals are totals; the others are per 90 minutes.</Text>
          {leaders.every((l) => l.length === 0) ? (
            <EmptyState isCompact title="No statistics yet" description="Leaders appear once a match in this competition is logged, checked and published." />
          ) : (
            <Grid columns={{ minWidth: 240, repeat: "fit" }} gap={4}>
              {LEADERS.map(({ key, total }, i) => (
                <VStack key={key} gap={1}>
                  <Text weight="semibold">{label(key)}{total ? "" : " per 90"}</Text>
                  <Table density="compact">
                    <TableBody>
                      {leaders[i].map((p, rank) => (
                        <TableRow key={p.id}>
                          <TableCell><Text type="supporting" hasTabularNumbers>{rank + 1}</Text></TableCell>
                          <TableCell><HStack gap={1} wrap="wrap" vAlign="center"><Link href={`/players/${p.id}`}>{p.display_name}</Link><VerifiedMark verified={p.id_verified} /></HStack></TableCell>
                          <TableCell><Text display="block" justify="end" hasTabularNumbers>{total ? Math.round(p.value) : fmtMetric(key, p.value)}</Text></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </VStack>
              ))}
            </Grid>
          )}
        </VStack>
      </Card>

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={3}>
            <Heading level={3}>Matches</Heading>
            {matches.length === 0 ? <EmptyState isCompact title="No matches yet" description="Matches appear here once they are scheduled." /> : <MatchList matches={matches} />}
          </VStack>
        </Card>
        <Card>
          <VStack gap={3}>
            <Heading level={3}>Teams</Heading>
            {teams.length === 0 ? <Text type="supporting">No teams yet.</Text> : (
              <Table density="compact">
                <TableBody>
                  {teams.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell><Link href={`/teams/${t.id}`}>{flag(t.name)} {t.name}</Link></TableCell>
                      <TableCell><Text type="supporting" display="block" justify="end">{t.players ? `${t.players} players used` : "No lineups yet"}</Text></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
