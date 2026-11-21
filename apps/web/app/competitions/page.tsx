import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting, type Q } from "@/lib/auth";
import { PageHead } from "../page-kit";
import { Demo } from "../ui";

export const dynamic = "force-dynamic";

type Competition = {
  id: string; name: string; season: string; country: string; age_group: string | null; is_demo: boolean;
  covered: boolean; owner: boolean; matches: number; published: number; teams: number;
};

export default async function Competitions() {
  await requireScouting();
  return db((tx) => CompetitionsPage(tx));
}

async function CompetitionsPage(tx: Q) {
  // Matches are readable only in covered competitions, so the counts are what this user's plan includes.
  const rows = await tx<Competition[]>`
    select c.id, c.name, c.season, c.country, c.age_group, c.is_demo,
           c.id in (select app.covered_competitions()) as covered,
           exists (select 1 from org_coverage oc where oc.competition_id = c.id and oc.org_id = (select app.org()) and oc.owner) as owner,
           (select count(*)::int from matches m where m.competition_id = c.id) as matches,
           (select count(*)::int from matches m where m.competition_id = c.id and m.status = 'published') as published,
           (select count(distinct t)::int from matches m, unnest(array[m.home_team_id, m.away_team_id]) t where m.competition_id = c.id) as teams
    from competitions c order by covered desc, c.season desc, c.name`;
  const included = rows.filter((r) => r.covered);

  return (
    <VStack gap={6}>
      <PageHead title="Competitions" intro={`Your plan includes ${included.length} of ${rows.length} ${rows.length === 1 ? "competition" : "competitions"}. A subscription unlocks competitions, not features; ask us to add one.`} />
      {rows.length === 0 ? <Card><EmptyState title="No competitions yet" description="Competitions appear when match data is loaded." /></Card> : (
        <Card>
          <Table density="compact" style={{ minWidth: "36rem" }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: "40%" }}>Competition</TableHeaderCell>
                <TableHeaderCell>In your plan</TableHeaderCell>
                <TableHeaderCell><Text type="inherit" display="block" justify="end">Matches</Text></TableHeaderCell>
                <TableHeaderCell><Text type="inherit" display="block" justify="end">Published</Text></TableHeaderCell>
                <TableHeaderCell><Text type="inherit" display="block" justify="end">Teams</Text></TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <VStack gap={0}>
                      <HStack gap={1} wrap="wrap" vAlign="center">
                        {c.covered ? <Link href={`/competitions/${c.id}`}>{c.name} {c.season}</Link> : <Text>{c.name} {c.season}</Text>}
                        {c.is_demo && <Demo />}
                      </HStack>
                      <Text type="supporting">{[c.country, c.age_group].filter(Boolean).join(" · ")}</Text>
                    </VStack>
                  </TableCell>
                  <TableCell>
                    <HStack gap={1} wrap="wrap">
                      {c.covered ? <Token size="sm" color="green" label="Included" /> : <Token size="sm" color="gray" label="Not included" />}
                      {c.owner && <Token size="sm" color="purple" label="Your competition" />}
                    </HStack>
                  </TableCell>
                  <TableCell><Text display="block" justify="end" hasTabularNumbers>{c.covered ? c.matches : "–"}</Text></TableCell>
                  <TableCell><Text display="block" justify="end" hasTabularNumbers>{c.covered ? c.published : "–"}</Text></TableCell>
                  <TableCell><Text display="block" justify="end" hasTabularNumbers>{c.covered ? c.teams : "–"}</Text></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </VStack>
  );
}
