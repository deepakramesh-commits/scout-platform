import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { StackItem } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting } from "@/lib/auth";
import { standouts } from "@/lib/fit";
import { fmtMetric, grouped, LOWER_IS_BETTER, metricLabel, ROLE_NAMES, rolePlural, smallGroupNote } from "@/lib/metrics";
import { latestTeam } from "@/lib/queries";
import {
  getAttributes, getEvidence, getProfiles, SEASON_YEAR, SOURCE_LABEL,
  type Attribute,
} from "@/lib/scouting";
import { Count, Demo, flag, PctBar, Pitch, PlayerAvatar } from "../../ui";
import { FitCard } from "./fit-card";
import { RiskAndMarket, type MarketPlayer } from "./risk-market";
import { ScoutView } from "./scout-view";
import { SectionTabs } from "./tabs";

export const dynamic = "force-dynamic";

type Player = {
  display_name: string; photo_url: string | null; photo_credit: string | null; photo_source_url: string | null;
  team: string | null; role: string; minutes: number; matches: number; peers: number; has_style: boolean;
  per90: Record<string, number | null>; percentiles: Record<string, number>; attr_percentiles: Record<string, number>;
  birth_year: number | null; height_cm: number | null; preferred_foot: string | null; nationality: string | null; demo_fields: string[];
} & MarketPlayer;
type Similar = { id: string; display_name: string; photo_url: string | null; team: string | null; similarity: number };
type Ev = { type: string; x: number; y: number; end_x: number | null; end_y: number | null; xg: number | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTIONS = [
  { value: "overview", label: "Overview" },
  { value: "scout", label: "Scout view" },
  { value: "market", label: "Risk and market" },
  { value: "similar", label: "Similar players" },
] as const;
type Section = (typeof SECTIONS)[number]["value"];
const isSection = (v: unknown): v is Section => SECTIONS.some((s) => s.value === v);

const styleMatch = (cosine: number) => Math.round(((1 + cosine) / 2) * 100);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function PlayerPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireScouting();
  const [{ id }, q] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const tab = first(q.tab);
  const section: Section = isSection(tab) ? tab : "overview";

  const [p] = await db((tx) => tx<Player[]>`
    select p.display_name, p.photo_url, p.photo_credit, p.photo_source_url, lt.team, m.role, m.minutes, m.per90, m.percentiles,
           m.attr_percentiles, m.peers, m.style is not null as has_style,
           p.birth_year, p.height_cm, p.preferred_foot, p.nationality, p.demo_fields, p.id_verified,
           m.competition_id, m.age_band, m.band_percentiles, m.band_peers,
           (select count(*)::int from lineups l where l.player_id = p.id and l.minutes_played > 0) as matches
    from players p
    join player_season_metrics m on m.player_id = p.id
    ${latestTeam(tx)}
    where p.id = ${id} and p.visible_to_scouts
    order by m.minutes desc limit 1`);
  if (!p) notFound();

  const [attributes, profiles, evidence] = await db((tx) => Promise.all([getAttributes(tx), getProfiles(tx), getEvidence(tx, [id]).then((m) => m.get(id)!)]));
  const attrs = new Map(attributes.map((a) => [a.key, a]));
  const fitParam = first(q.fit);
  const profile = profiles.find((r) => r.id === fitParam) ?? profiles.find((r) => r.positions.includes(p.role)) ?? profiles[0];
  const href = (s: Section) => `/players/${id}?tab=${s}${fitParam ? `&fit=${fitParam}` : ""}`;
  const plural = rolePlural(p.role);
  const ageDemo = p.demo_fields.includes("birth_year");

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
                  <Token label={ROLE_NAMES[p.role] ?? p.role} color="green" />
                  <Text color="secondary">{p.matches} matches · {p.minutes} minutes</Text>
                  <HStack gap={1} vAlign="center">
                    <Text color="secondary">{p.birth_year == null ? "Age not recorded" : `Age ${SEASON_YEAR - p.birth_year}`}</Text>
                    {p.birth_year != null && ageDemo && <Demo />}
                  </HStack>
                </HStack>
              </VStack>
              <HStack>
                <Button variant="primary" label="Compare with another player" href={`/compare?a=${id}`} />
              </HStack>
            </VStack>
          </StackItem>
        </HStack>
      </Card>

      <SectionTabs value={section} tabs={SECTIONS.map((s) => ({ ...s, href: href(s.value) }))} />

      {section === "overview" && <Overview id={id} p={p} attrs={attrs} plural={plural}
        fit={profile && <FitCard playerId={id} profiles={profiles} profile={profile} attributes={attrs} evidence={evidence} peers={p.peers} role={p.role} />} />}
      {section === "scout" && <ScoutView id={id} user={user} attributes={attributes} evidence={evidence} peers={p.peers} role={p.role} />}
      {section === "market" && <RiskAndMarket id={id} p={p} />}
      {section === "similar" && <SimilarPlayers id={id} p={p} plural={plural} />}
    </VStack>
  );
}

async function Overview({ id, p, attrs, plural, fit }: { id: string; p: Player; attrs: Map<string, Attribute>; plural: string; fit: React.ReactNode }) {
  const events = await db((tx) => tx<Ev[]>`
    select type, x::float8 as x, y::float8 as y, end_x::float8 as end_x, end_y::float8 as end_y, (extra ->> 'xg')::float8 as xg
    from events
    where player_id = ${id} and x is not null and (
      type in ('ball_recovery', 'shot')
      or (type = 'carry' and y >= 62 and end_y between 30 and 62 and end_x >= 80))`);
  const best = standouts(p.attr_percentiles);
  const small = smallGroupNote(p.peers, p.role);
  const keys = Object.keys(p.per90);

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Heading level={2}>Standout qualities</Heading>
        <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={3}>
          {best.map((k) => {
            const a = attrs.get(k);
            return (
              <Card key={k} variant="muted" padding={3}>
                <VStack gap={0}>
                  <Heading level={2}><Count value={p.attr_percentiles[k]} /></Heading>
                  <Text weight="semibold">{a?.label ?? k}</Text>
                  <Text type="supporting">Percentile among {plural} · {a ? SOURCE_LABEL[a.source] : ""}</Text>
                </VStack>
              </Card>
            );
          })}
          {best.length === 0 && (
            <Card variant="muted" padding={3}>
              <Text type="supporting">
                {Object.keys(p.attr_percentiles).length
                  ? `No attribute above the 85th percentile among ${plural}.`
                  : "Not enough minutes to rank yet."}
              </Text>
            </Card>
          )}
        </Grid>
        {best.length > 0 && small && <Text type="supporting">Treat these as indicative: {small}.</Text>}
      </VStack>

      {fit}

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
                      <Text maxLines={1}>{metricLabel(k)}</Text>
                      <PctBar pct={p.percentiles[k]} i={before + ri} lowerIsBetter={LOWER_IS_BETTER.has(k)} />
                      <Text type="supporting" display="block" justify="end" hasTabularNumbers>{fmtMetric(k, p.per90[k])}</Text>
                      <Text weight="bold" display="block" justify="end"><Count value={p.percentiles[k]} i={before + ri} /></Text>
                    </Grid>
                  ))}
                </VStack>
              );
            })}
            <Divider />
            <Text type="supporting">
              Bars show the percentile among {plural} with enough minutes; the grey figure is per 90 minutes, or a share of attempts where marked %.
              “–” means too few attempts to judge. For ball losses a high percentile means many losses.
              {small && ` These rankings are ${small}, so treat them as indicative.`}
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
    </VStack>
  );
}

async function SimilarPlayers({ id, p, plural }: { id: string; p: Player; plural: string }) {
  const similar = p.has_style
    ? await db((tx) => tx<Similar[]>`
        select p.id, p.display_name, p.photo_url, lt.team, 1 - (m.style <=> me.style) as similarity
        from player_season_metrics me
        join player_season_metrics m on m.role = me.role and m.competition_id = me.competition_id
          and m.player_id <> me.player_id and m.style is not null
        join players p on p.id = m.player_id and p.visible_to_scouts
        ${latestTeam(tx)}
        where me.player_id = ${id} and me.role = ${p.role}
        order by m.style <=> me.style
        limit 8`)
    : [];
  return (
    <VStack gap={3}>
      <Heading level={2}>Similar {plural} · style match</Heading>
      {similar.length ? (
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
                <Text weight="bold" color="accent" hasTabularNumbers>{styleMatch(s.similarity)}%</Text>
              </HStack>
            </ClickableCard>
          ))}
        </Grid>
      ) : (
        <Card variant="muted">
          <EmptyState isCompact title="No style matches yet" description="Style comparisons need enough minutes in this position." />
        </Card>
      )}
      {similar.length > 0 && (
        <HStack>
          <Button label={`Compare with ${similar[0].display_name}`} href={`/compare?a=${id}&b=${similar[0].id}`} />
        </HStack>
      )}
    </VStack>
  );
}
