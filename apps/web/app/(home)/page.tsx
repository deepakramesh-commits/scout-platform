import { ViewTransition } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting, type Q } from "@/lib/auth";
import { standouts } from "@/lib/fit";
import { fmtMetric, fmtWithUnit, label, LOWER_IS_BETTER, metricLabel, PRESETS, ROLE_NAMES, unit } from "@/lib/metrics";
import { latestTeam, searchOptions, searchRows } from "@/lib/queries";
import { parseSearch, searchQuery, type SearchParams } from "@/lib/search";
import { getAttributes } from "@/lib/scouting";
import { SaveSearch } from "../save-search";
import { VerifiedMark } from "../verified";
import { Filters } from "./filters";
import { Count, Demo, flag, PctBadge, PlayerAvatar, Standouts } from "../ui";

export const dynamic = "force-dynamic";

type Kpis = { players: number; matches: number; teams: number; events: number; qualified: number };
type Featured = { id: string; display_name: string; id_verified: boolean; photo_url: string | null; team: string | null; role: string; minutes: number; per90: Record<string, number | null>; percentiles: Record<string, number> };

// The featured prospect is the leader of the first preset, so it always matches a list the scout can open.
const FEATURED = PRESETS[0];

export default async function Search(props: { searchParams: Promise<SearchParams> }) {
  await requireScouting();
  return db((tx) => SearchPage(tx, props));
}

async function SearchPage(tx: Q, { searchParams }: { searchParams: Promise<SearchParams> }) {
  const q = await searchParams;
  const [options, attributes] = await Promise.all([searchOptions(tx), getAttributes(tx)]);
  const { keys, roles, countries, competitions } = options;
  const attrLabels = Object.fromEntries(attributes.map((a) => [a.key, a.label]));
  const initial = parseSearch(q, options);
  const sort = initial.sort ?? "";
  const ascending = LOWER_IS_BETTER.has(sort);
  const comp = competitions.find((c) => c.id === initial.competition) ?? null;
  const cid = comp?.id ?? null;

  const [[kpi], [featured], rows] = await Promise.all([
    tx<Kpis[]>`
      select (select count(distinct m.player_id)::int from player_season_metrics m join players p on p.id = m.player_id
               where p.visible_to_scouts and m.competition_id = ${cid}) as players,
             (select count(*)::int from matches where competition_id = ${cid} and status = 'published') as matches,
             (select count(distinct t)::int from matches m, unnest(array[m.home_team_id, m.away_team_id]) t
               where m.competition_id = ${cid} and m.status = 'published') as teams,
             (select count(*)::int from events e join matches m on m.id = e.match_id
               where m.competition_id = ${cid} and m.status = 'published') as events,
             (select count(distinct m.player_id)::int from player_season_metrics m join players p on p.id = m.player_id
               where p.visible_to_scouts and m.competition_id = ${cid} and m.style is not null) as qualified`,
    tx<Featured[]>`
      select p.id, p.display_name, p.id_verified, p.photo_url, lt.team, m.role, m.minutes, m.per90, m.percentiles
      from player_season_metrics m
      join players p on p.id = m.player_id
      ${latestTeam(tx)}
      where p.visible_to_scouts and m.competition_id = ${cid} and m.role = ${FEATURED.role} and (m.percentiles ->> ${FEATURED.sort}) is not null
      order by (m.per90 ->> ${FEATURED.sort})::float8 desc
      limit 1`,
    searchRows(tx, initial),
  ]);
  const { role } = initial;

  const tiles = [
    { label: "Players", value: kpi.players, note: "With minutes on the pitch" },
    { label: "Matches", value: kpi.matches, note: "Published, every action logged" },
    { label: "Teams", value: kpi.teams, note: "That played a published match" },
    { label: "Events", value: Math.round(kpi.events / 1000), suffix: "k", note: `${kpi.events.toLocaleString("en")} logged actions` },
    { label: "Qualified", value: kpi.qualified, note: `${comp?.min_minutes ?? 0}+ minutes, ranked by position` },
  ];

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Find your next player</Heading>
        <Text color="secondary">
          {comp
            ? `Every player in ${comp.name}, scored on ${keys.length} per-90 measures and ranked against others in the same position in that competition.`
            : "No competition in your plan has published numbers yet. Ask us to add one."}
        </Text>
      </VStack>

      <Grid columns={{ minWidth: 150, repeat: "fit" }} gap={3}>
        {tiles.map((t, i) => (
          <Card key={t.label}>
            <VStack gap={1}>
              <Text type="supporting">{t.label}</Text>
              <Heading level={2}><Count value={t.value} suffix={t.suffix} i={i * 2} /></Heading>
              <Text type="supporting">{t.note}</Text>
            </VStack>
          </Card>
        ))}
      </Grid>

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4}>
        {featured && comp && <FeaturedCard p={featured} competition={comp} />}
        <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={3}>
          {PRESETS.filter((p) => roles.includes(p.role) && keys.includes(p.sort)).map((p) => (
            <ClickableCard key={p.title} className="lift" label={p.title} href={`/?${new URLSearchParams({ ...(cid && { competition: cid }), role: p.role, sort: p.sort })}`}
              variant={role === p.role && sort === p.sort ? "green" : "default"}>
              <VStack gap={1}>
                <Text weight="semibold">{p.title}</Text>
                <Text type="supporting">{p.blurb}</Text>
                <Text type="label" color="accent">{ROLE_NAMES[p.role] ?? p.role} · {label(p.sort)}</Text>
              </VStack>
            </ClickableCard>
          ))}
        </Grid>
      </Grid>

      <Card>
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
            <Heading level={3}>Players</Heading>
            <Text type="supporting">{rows.length === 100 ? "Top 100" : `${rows.length} players`} · ranked by {metricLabel(sort).toLowerCase()}{unit(sort) === "/ 90" ? " per 90" : ""}{comp && ` within ${comp.name}`}</Text>
          </HStack>
          <Filters
            key={JSON.stringify(initial)}
            roles={roles.map((r) => ({ value: r, label: ROLE_NAMES[r] ?? r }))}
            metrics={keys.map((k) => ({ value: k, label: label(k) }))}
            countries={countries.map((c) => ({ value: c, label: c }))}
            competitions={competitions.map((c) => ({ value: c.id, label: c.name }))}
            initial={{ ...initial, sort }}
          />
          <SaveSearch query={searchQuery(initial)} />
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Demo />
            <Text type="supporting">Age and contract filters run on demo birth years and contract dates until real values exist.</Text>
          </HStack>
          <Table density="compact" hasHover style={{ minWidth: "52rem" }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: "4%" }}>#</TableHeaderCell>
                <TableHeaderCell style={{ width: "30%" }}>Player</TableHeaderCell>
                <TableHeaderCell>Position</TableHeaderCell>
                <TableHeaderCell><Text type="inherit" display="block" justify="end">Minutes</Text></TableHeaderCell>
                <TableHeaderCell><Text type="inherit" display="block" justify="end">{label(sort)} {unit(sort)}</Text></TableHeaderCell>
                <TableHeaderCell><Text type="inherit" display="block" justify="end">Percentile</Text></TableHeaderCell>
                <TableHeaderCell>Standout qualities</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.id}-${r.role}`} className={i < 10 ? "in" : undefined} style={i < 10 ? ({ "--i": i } as React.CSSProperties) : undefined}>
                  <TableCell><Text type="supporting" hasTabularNumbers>{i + 1}</Text></TableCell>
                  <TableCell>
                    <Link href={cid ? `/players/${r.id}?comp=${cid}` : `/players/${r.id}`}>
                      <HStack gap={2} vAlign="center">
                        {/* a player can be listed once per position; only the first row owns the transition name */}
                        {rows.findIndex((o) => o.id === r.id) === i
                          ? <ViewTransition name={`avatar-${r.id}`}><PlayerAvatar name={r.display_name} photo={r.photo_url} /></ViewTransition>
                          : <PlayerAvatar name={r.display_name} photo={r.photo_url} />}
                        <VStack gap={0}>
                          <HStack gap={1} vAlign="center" wrap="wrap"><Text weight="semibold">{r.display_name}</Text><VerifiedMark verified={r.id_verified} /></HStack>
                          <Text type="supporting">{flag(r.team)} {r.team}</Text>
                        </VStack>
                      </HStack>
                    </Link>
                  </TableCell>
                  <TableCell><Token size="sm" label={r.role} description={ROLE_NAMES[r.role]} /></TableCell>
                  <TableCell><Text display="block" justify="end" hasTabularNumbers>{r.minutes}</Text></TableCell>
                  <TableCell><Text display="block" justify="end" hasTabularNumbers>{fmtMetric(sort, r.value)}</Text></TableCell>
                  <TableCell><HStack hAlign="end"><PctBadge pct={r.pct} lowerIsBetter={ascending} /></HStack></TableCell>
                  <TableCell><Standouts keys={standouts(r.attr_percentiles)} labels={attrLabels} peers={r.peers} role={r.role} /></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7}><Text type="supporting">No players match. Loosen a filter, or pick a preset above.</Text></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <Text type="supporting">Percentiles compare players in the same position and competition who played enough minutes to judge{comp && ` (${comp.min_minutes} in ${comp.name})`}. Players below the cut-off show “–” and sort last. A player with numbers in several competitions is ranked within each one separately.</Text>
        </VStack>
      </Card>
    </VStack>
  );
}

function FeaturedCard({ p, competition }: { p: Featured; competition: { id: string; name: string } }) {
  const top = Object.keys(p.percentiles).filter((k) => !LOWER_IS_BETTER.has(k)).sort((a, b) => p.percentiles[b] - p.percentiles[a]).slice(0, 3);
  return (
    <Card className="rise" elevation="low">
      <VStack gap={4}>
        <HStack gap={4} vAlign="center">
          <PlayerAvatar name={p.display_name} photo={p.photo_url} size={96} />
          <VStack gap={1}>
            <Text type="label" color="accent">Featured prospect</Text>
            <HStack gap={2} vAlign="center" wrap="wrap"><Heading level={2}>{p.display_name}</Heading><VerifiedMark verified={p.id_verified} /></HStack>
            <Text color="secondary">{flag(p.team)} {p.team} · {ROLE_NAMES[p.role] ?? p.role} · {p.minutes} min in {competition.name}</Text>
          </VStack>
        </HStack>
        <Grid columns={{ minWidth: 120, repeat: "fit" }} gap={2}>
          {top.map((k, i) => (
            <Card key={k} variant="muted" padding={3}>
              <VStack gap={0}>
                <Heading level={3}><Count value={p.percentiles[k]} i={i * 2 + 2} /></Heading>
                <Text type="supporting">{label(k)} percentile · {fmtWithUnit(k, p.per90[k])}</Text>
              </VStack>
            </Card>
          ))}
        </Grid>
        <HStack gap={2} wrap="wrap">
          <Button variant="primary" label="Open profile" href={`/players/${p.id}?comp=${competition.id}`} />
          <Button label="Compare" href={`/compare?a=${p.id}&ca=${competition.id}`} />
        </HStack>
      </VStack>
    </Card>
  );
}
