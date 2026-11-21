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
import { sql } from "@/lib/db";
import { label, metricKeys, PRESETS, ROLE_NAMES } from "@/lib/metrics";
import { latestTeam } from "@/lib/queries";
import { Filters } from "./filters";
import { Count, flag, PctBadge, PlayerAvatar } from "../ui";

export const dynamic = "force-dynamic";

type Row = { id: string; display_name: string; photo_url: string | null; team: string | null; role: string; minutes: number; value: number | null; pct: number | null };
type Kpis = { players: number; matches: number; nations: number; events: number; qualified: number };
type Featured = { id: string; display_name: string; photo_url: string | null; team: string | null; role: string; minutes: number; per90: Record<string, number>; percentiles: Record<string, number> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const int = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : null);

// The featured prospect is the leader of the first preset, so it always matches a list the scout can open.
const FEATURED = PRESETS[0];

export default async function Search({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const keys = await metricKeys(sql);
  const roles = (await sql<{ role: string }[]>`select distinct role from player_season_metrics order by 1`).map((r) => r.role);

  const requested = first(q.sort);
  const sort = requested && keys.includes(requested) ? requested : keys.includes("cut_ins") ? "cut_ins" : keys[0];
  const role = roles.includes(first(q.role) ?? "") ? first(q.role)! : null;
  const name = first(q.name) ?? null;
  const minPct = int(first(q.minPct));
  const minMinutes = int(first(q.minMinutes)) ?? 0;

  const [[kpi], [featured], rows] = await Promise.all([
    sql<Kpis[]>`
      select (select count(*)::int from players where visible_to_scouts) as players,
             (select count(*)::int from matches) as matches,
             (select count(*)::int from teams) as nations,
             (select count(*)::int from events) as events,
             (select count(distinct m.player_id)::int from player_season_metrics m join players p on p.id = m.player_id
               where p.visible_to_scouts and m.style is not null) as qualified`,
    sql<Featured[]>`
      select p.id, p.display_name, p.photo_url, lt.team, m.role, m.minutes, m.per90, m.percentiles
      from player_season_metrics m
      join players p on p.id = m.player_id
      ${latestTeam()}
      where p.visible_to_scouts and m.role = ${FEATURED.role} and (m.percentiles ->> ${FEATURED.sort}) is not null
      order by (m.per90 ->> ${FEATURED.sort})::float8 desc
      limit 1`,
    sort
      ? sql<Row[]>`
          select p.id, p.display_name, p.photo_url, lt.team, m.role, m.minutes,
                 (m.per90 ->> ${sort})::float8 as value, (m.percentiles ->> ${sort})::int as pct
          from player_season_metrics m
          join players p on p.id = m.player_id
          ${latestTeam()}
          where p.visible_to_scouts
            and (${role}::text is null or m.role = ${role})
            and (${name}::text is null or p.display_name ilike '%' || ${name} || '%')
            and m.minutes >= ${minMinutes}
            and (${minPct}::int is null or (m.percentiles ->> ${sort})::int >= ${minPct})
          -- players under the minutes threshold have no percentiles; rank them after the qualified ones so tiny samples can't top the list
          order by (m.percentiles ->> ${sort}) is null, value desc nulls last, p.display_name
          limit 100`
      : Promise.resolve([] as Row[]),
  ]);

  const tiles = [
    { label: "Players", value: kpi.players, note: "Every squad member at the finals" },
    { label: "Matches", value: kpi.matches, note: "Group stage to final" },
    { label: "Nations", value: kpi.nations, note: "Teams at AFCON 2023" },
    { label: "Events", value: Math.round(kpi.events / 1000), suffix: "k", note: `${kpi.events.toLocaleString("en")} on-ball actions` },
    { label: "Qualified", value: kpi.qualified, note: "270+ minutes, ranked by position" },
  ];

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Find your next player</Heading>
        <Text color="secondary">Every player at AFCON 2023, scored on {keys.length} per-90 measures and ranked against others in the same position.</Text>
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
        {featured && <FeaturedCard p={featured} />}
        <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={3}>
          {PRESETS.filter((p) => roles.includes(p.role) && keys.includes(p.sort)).map((p) => (
            <ClickableCard key={p.title} className="lift" label={p.title} href={`/?role=${p.role}&sort=${p.sort}`}
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
            <Text type="supporting">{rows.length === 100 ? "Top 100" : `${rows.length} players`} · ranked by {label(sort).toLowerCase()} per 90</Text>
          </HStack>
          <Filters
            key={JSON.stringify([role, sort, minPct, name, minMinutes])}
            roles={roles.map((r) => ({ value: r, label: ROLE_NAMES[r] ?? r }))}
            metrics={keys.map((k) => ({ value: k, label: label(k) }))}
            initial={{ role, sort, minPct, name, minMinutes: minMinutes || null }}
          />
          <Table density="compact" hasHover style={{ minWidth: "42rem" }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: "4%" }}>#</TableHeaderCell>
                <TableHeaderCell style={{ width: "38%" }}>Player</TableHeaderCell>
                <TableHeaderCell>Position</TableHeaderCell>
                <TableHeaderCell><Text type="inherit" display="block" justify="end">Minutes</Text></TableHeaderCell>
                <TableHeaderCell><Text type="inherit" display="block" justify="end">{label(sort)} / 90</Text></TableHeaderCell>
                <TableHeaderCell><Text type="inherit" display="block" justify="end">Percentile</Text></TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.id}-${r.role}`} className={i < 10 ? "in" : undefined} style={i < 10 ? ({ "--i": i } as React.CSSProperties) : undefined}>
                  <TableCell><Text type="supporting" hasTabularNumbers>{i + 1}</Text></TableCell>
                  <TableCell>
                    <Link href={`/players/${r.id}`}>
                      <HStack gap={2} vAlign="center">
                        {/* a player can be listed once per position; only the first row owns the transition name */}
                        {rows.findIndex((o) => o.id === r.id) === i
                          ? <ViewTransition name={`avatar-${r.id}`}><PlayerAvatar name={r.display_name} photo={r.photo_url} /></ViewTransition>
                          : <PlayerAvatar name={r.display_name} photo={r.photo_url} />}
                        <VStack gap={0}>
                          <Text weight="semibold">{r.display_name}</Text>
                          <Text type="supporting">{flag(r.team)} {r.team}</Text>
                        </VStack>
                      </HStack>
                    </Link>
                  </TableCell>
                  <TableCell><Token size="sm" label={r.role} description={ROLE_NAMES[r.role]} /></TableCell>
                  <TableCell><Text display="block" justify="end" hasTabularNumbers>{r.minutes}</Text></TableCell>
                  <TableCell><Text display="block" justify="end" hasTabularNumbers>{r.value?.toFixed(2)}</Text></TableCell>
                  <TableCell><HStack hAlign="end"><PctBadge pct={r.pct} /></HStack></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6}><Text type="supporting">No players match. Loosen a filter, or pick a preset above.</Text></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <Text type="supporting">Percentiles compare players in the same position who played enough minutes to judge. Players below the cut-off show “–” and sort last.</Text>
        </VStack>
      </Card>
    </VStack>
  );
}

function FeaturedCard({ p }: { p: Featured }) {
  const top = Object.keys(p.percentiles).sort((a, b) => p.percentiles[b] - p.percentiles[a]).slice(0, 3);
  return (
    <Card className="rise" elevation="low">
      <VStack gap={4}>
        <HStack gap={4} vAlign="center">
          <PlayerAvatar name={p.display_name} photo={p.photo_url} size={96} />
          <VStack gap={1}>
            <Text type="label" color="accent">Featured prospect</Text>
            <Heading level={2}>{p.display_name}</Heading>
            <Text color="secondary">{flag(p.team)} {p.team} · {ROLE_NAMES[p.role] ?? p.role} · {p.minutes} min</Text>
          </VStack>
        </HStack>
        <Grid columns={{ minWidth: 120, repeat: "fit" }} gap={2}>
          {top.map((k, i) => (
            <Card key={k} variant="muted" padding={3}>
              <VStack gap={0}>
                <Heading level={3}><Count value={p.percentiles[k]} i={i * 2 + 2} /></Heading>
                <Text type="supporting">{label(k)} percentile · {p.per90[k].toFixed(2)} / 90</Text>
              </VStack>
            </Card>
          ))}
        </Grid>
        <HStack gap={2} wrap="wrap">
          <Button variant="primary" label="Open profile" href={`/players/${p.id}`} />
          <Button label="Compare" href={`/compare?a=${p.id}`} />
        </HStack>
      </VStack>
    </Card>
  );
}
