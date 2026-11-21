import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { StackItem } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { sql } from "@/lib/db";
import { grouped, label, ROLE_NAMES } from "@/lib/metrics";
import { latestTeam } from "@/lib/queries";
import { Count, flag, PctBar, Pitch, PlayerAvatar } from "../../ui";

export const dynamic = "force-dynamic";

type Profile = {
  display_name: string; photo_url: string | null; photo_credit: string | null; photo_source_url: string | null;
  team: string | null; role: string; minutes: number; matches: number; peers: number;
  per90: Record<string, number>; percentiles: Record<string, number>; has_style: boolean;
};
type Similar = { id: string; display_name: string; photo_url: string | null; team: string | null; similarity: number };
type Ev = { type: string; x: number; y: number; end_x: number | null; end_y: number | null; xg: number | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [p] = await sql<Profile[]>`
    select p.display_name, p.photo_url, p.photo_credit, p.photo_source_url, lt.team, m.role, m.minutes, m.per90, m.percentiles,
           m.style is not null as has_style,
           (select count(*)::int from lineups l where l.player_id = p.id and l.minutes_played > 0) as matches,
           (select count(*)::int from player_season_metrics o where o.role = m.role and o.competition_id = m.competition_id and o.style is not null) as peers
    from players p
    join player_season_metrics m on m.player_id = p.id
    ${latestTeam()}
    where p.id = ${id} and p.visible_to_scouts
    order by m.minutes desc limit 1`;
  if (!p) notFound();

  const [similar, events] = await Promise.all([
    p.has_style
      ? sql<Similar[]>`
          select p.id, p.display_name, p.photo_url, lt.team, 1 - (m.style <=> me.style) as similarity
          from player_season_metrics me
          join player_season_metrics m on m.role = me.role and m.competition_id = me.competition_id
            and m.player_id <> me.player_id and m.style is not null
          join players p on p.id = m.player_id and p.visible_to_scouts
          ${latestTeam()}
          where me.player_id = ${id} and me.role = ${p.role}
          order by m.style <=> me.style
          limit 8`
      : Promise.resolve([] as Similar[]),
    // Same cut-in rule as worker/metrics.py `_cut_in`.
    sql<Ev[]>`
      select type, x::float8 as x, y::float8 as y, end_x::float8 as end_x, end_y::float8 as end_y, (extra ->> 'xg')::float8 as xg
      from events
      where player_id = ${id} and x is not null and (
        type in ('ball_recovery', 'shot')
        or (type = 'carry' and y >= 62 and end_y between 30 and 62 and end_x >= 80))`,
  ]);

  const keys = Object.keys(p.per90);
  const top = keys.filter((k) => p.percentiles[k] != null).sort((a, b) => p.percentiles[b] - p.percentiles[a]).slice(0, 3);
  const roleName = ROLE_NAMES[p.role] ?? p.role;
  const plural = roleName.toLowerCase() + "s";

  return (
    <VStack gap={6}>
      <HStack>
        <Button variant="ghost" size="sm" label="Back to search" href="/" icon={<Icon icon="chevronLeft" />} />
      </HStack>

      <Card elevation="low">
        <HStack gap={6} wrap="wrap" vAlign="center">
          <VStack gap={1} hAlign="start" maxWidth={144}>
            <ViewTransition name={`avatar-${id}`}>
              <PlayerAvatar name={p.display_name} photo={p.photo_url} size={144} />
            </ViewTransition>
            {p.photo_credit && (
              <Text type="supporting" size="xsm">
                Photo: {p.photo_source_url ? <Link href={p.photo_source_url} isExternalLink size="xsm">{p.photo_credit}</Link> : p.photo_credit}
              </Text>
            )}
          </VStack>
          <StackItem size="fill">
            <VStack gap={4}>
              <VStack gap={2}>
                <Heading level={1}>{p.display_name}</Heading>
                <HStack gap={3} wrap="wrap" vAlign="center">
                  <Text color="secondary">{flag(p.team)} {p.team}</Text>
                  <Token label={roleName} color="green" />
                  <Text color="secondary">{p.matches} matches · {p.minutes} minutes</Text>
                </HStack>
              </VStack>
              <Grid columns={{ minWidth: 150, repeat: "fit" }} gap={3}>
                {top.map((k) => (
                  <Card key={k} variant="muted" padding={3}>
                    <VStack gap={0}>
                      <Heading level={2}><Count value={p.percentiles[k]} /></Heading>
                      <Text type="supporting">{label(k)} percentile · {p.per90[k].toFixed(2)} / 90</Text>
                    </VStack>
                  </Card>
                ))}
                {top.length === 0 && (
                  <Card variant="muted" padding={3}>
                    <VStack gap={0}><Heading level={2}>–</Heading><Text type="supporting">Not enough minutes to rank yet</Text></VStack>
                  </Card>
                )}
              </Grid>
              <HStack>
                <Button variant="primary" label={similar[0] ? `Compare with ${similar[0].display_name}` : "Compare with another player"}
                  href={`/compare?a=${id}${similar[0] ? `&b=${similar[0].id}` : ""}`} />
              </HStack>
            </VStack>
          </StackItem>
        </HStack>
      </Card>

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={3}>
            <Heading level={3}>Percentiles vs {p.peers} {plural}</Heading>
            {grouped(keys).map(([g, ks], gi, all) => {
              // Stagger slot: row order, plus a 3-slot (120ms) pause before each new group.
              const before = all.slice(0, gi).reduce((n, [, prev]) => n + prev.length, 0) + gi * 3;
              return (
                <VStack key={g} gap={1}>
                  <Text type="label" color="secondary">{g}</Text>
                  {ks.map((k, ri) => (
                    <Grid key={k} className="mrow" gap={2}>
                      <Text maxLines={1}>{label(k)}</Text>
                      <PctBar pct={p.percentiles[k]} i={before + ri} />
                      <Text type="supporting" display="block" justify="end" hasTabularNumbers>{p.per90[k].toFixed(2)}</Text>
                      <Text weight="bold" display="block" justify="end"><Count value={p.percentiles[k]} i={before + ri} /></Text>
                    </Grid>
                  ))}
                </VStack>
              );
            })}
            <Divider />
            <Text type="supporting">
              Bars show the percentile among {plural} with enough minutes; the grey figure is per 90 minutes.
              {p.peers < 15 && ` Only ${p.peers} players qualify in this position, so treat rankings as indicative.`}
            </Text>
          </VStack>
        </Card>

        <Card>
          <Pitch
            title={<Heading level={3}>Where they act</Heading>}
            cutIns={events.filter((e) => e.type === "carry")}
            recoveries={events.filter((e) => e.type === "ball_recovery")}
            shots={events.filter((e) => e.type === "shot")}
          />
        </Card>
      </Grid>

      <VStack gap={3}>
        <Heading level={3}>Similar {plural} · style match</Heading>
        {p.has_style ? (
          <Grid columns={{ minWidth: 250, repeat: "fill" }} gap={3}>
            {similar.map((s) => (
              <ClickableCard key={s.id} className="lift" label={s.display_name} href={`/players/${s.id}`} padding={3}>
                <HStack gap={3} vAlign="center">
                  <PlayerAvatar name={s.display_name} photo={s.photo_url} size={48} />
                  <StackItem size="fill">
                    <VStack gap={0}>
                      <Text weight="semibold" maxLines={1}>{s.display_name}</Text>
                      <Text type="supporting" maxLines={1}>{flag(s.team)} {s.team}</Text>
                    </VStack>
                  </StackItem>
                  {/* cosine is -1..1; shown as a 0-100 style match */}
                  <Text weight="bold" color="accent" hasTabularNumbers>{Math.round(((1 + s.similarity) / 2) * 100)}%</Text>
                </HStack>
              </ClickableCard>
            ))}
          </Grid>
        ) : (
          <Text color="secondary">Needs more minutes for comparisons.</Text>
        )}
      </VStack>
    </VStack>
  );
}
