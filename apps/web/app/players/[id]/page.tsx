import { notFound } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting } from "@/lib/auth";
import { fmtMetric, grouped, LOWER_IS_BETTER, metricLabel, rolePlural, smallGroupNote } from "@/lib/metrics";
import { recordProfileView } from "@/lib/profile-views";
import { latestTeam } from "@/lib/queries";
import {
  getAttributes, getEvidence, getProfiles, pickProfile,
  type Attribute,
} from "@/lib/scouting";
import { Count, flag, PctBar, Pitch, PlayerAvatar } from "../../ui";
import { PlayerActions } from "../../player-actions";
import { FitCard } from "./fit-card";
import { StandoutQualities } from "./standouts";
import { PlayerHeader } from "./header";
import { getPlayer, UUID, type Player, type PlayerWithoutData } from "./player";
import { loadRiskMarket, MarketFacts, RiskAndMarket, TestsTable } from "./risk-market";
import { ScoutView } from "./scout-view";
import { SectionTabs } from "./tabs";

export const dynamic = "force-dynamic";

type Similar = { id: string; display_name: string; photo_url: string | null; team: string | null; similarity: number };
type Ev = { type: string; x: number; y: number; end_x: number | null; end_y: number | null; xg: number | null };

const SECTIONS = [
  { value: "overview", label: "Overview" },
  { value: "scout", label: "Scout view" },
  { value: "market", label: "Risk and market" },
  { value: "similar", label: "Similar players" },
] as const;
type Section = (typeof SECTIONS)[number]["value"];
const isSection = (v: unknown): v is Section => SECTIONS.some((s) => s.value === v);

const GROUP_PAUSE_SLOTS = 3;
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

  const p = await db((tx) => getPlayer(tx, id));
  if (!p) notFound();
  await recordProfileView(id);
  const [attributes, profiles, evidence] = await db((tx) => Promise.all([getAttributes(tx), getProfiles(tx), getEvidence(tx, [id]).then((m) => m.get(id)!)]));
  const fitParam = first(q.fit);
  const profile = pickProfile(profiles, fitParam, p.role);
  const back = <HStack><Button variant="ghost" size="sm" label="Back to search" href="/" icon={<Icon icon="chevronLeft" />} /></HStack>;
  const header = (
    <Card elevation="low">
      <PlayerHeader id={id} p={p}>
        <HStack gap={2} wrap="wrap">
          {p.role != null && <Button variant="primary" label="Compare with another player" href={`/compare?a=${id}`} />}
          <Button label="Scouting report" href={`/players/${id}/report/print${profile ? `?profile=${profile.id}` : ""}`} />
        </HStack>
        <PlayerActions playerId={id} />
      </PlayerHeader>
    </Card>
  );

  if (p.role == null) {
    return (
      <VStack gap={6}>
        {back}
        {header}
        <Card variant="muted">
          <EmptyState title="No published match data yet"
            description="Statistics, percentiles, fit and risk appear once a match he plays in is logged and passes the quality check. Until then this profile shows what he, his club or scouts have recorded." />
        </Card>
        <ProfileFacts id={id} p={p} />
        <ScoutView id={id} user={user} attributes={attributes} evidence={evidence} peers={0} role={null} />
      </VStack>
    );
  }

  const attrs = new Map(attributes.map((a) => [a.key, a]));
  const href = (s: Section) => `/players/${id}?tab=${s}${fitParam ? `&fit=${fitParam}` : ""}`;
  const plural = rolePlural(p.role);

  return (
    <VStack gap={6}>
      {back}
      {header}

      <SectionTabs value={section} tabs={SECTIONS.map((s) => ({ ...s, href: href(s.value) }))} />

      {section === "overview" && <Overview id={id} p={p} attrs={attrs} plural={plural}
        fit={profile && <FitCard pick={{ action: `/players/${id}`, name: "fit", profiles }} profile={profile} attributes={attrs} evidence={evidence} peers={p.peers} role={p.role} />} />}
      {section === "scout" && <ScoutView id={id} user={user} attributes={attributes} evidence={evidence} peers={p.peers} role={p.role} />}
      {section === "market" && <RiskAndMarket id={id} p={p} />}
      {section === "similar" && <SimilarPlayers id={id} p={p} plural={plural} />}
    </VStack>
  );
}

/** Market facts and tests for a profile without match data. */
async function ProfileFacts({ id, p }: { id: string; p: PlayerWithoutData }) {
  const { facts, tests, can } = await db((tx) => loadRiskMarket(tx, id, { ...p, minutes: 0, competition_id: null }));
  return (
    <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
      <Card>
        <VStack gap={3}>
          <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
            <Heading level={2}>Market</Heading>
            {(can.market || can.player) && <Button size="sm" label="Edit" href={`/players/${id}/market`} />}
          </HStack>
          <MarketFacts facts={facts.filter((f) => f.label !== "Foot in match data")} />
        </VStack>
      </Card>
      <Card>
        <VStack gap={3}>
          <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
            <Heading level={2}>Physical tests</Heading>
            {can.addTest && <Button size="sm" label="Add a test" href={`/players/${id}/market#tests`} />}
          </HStack>
          {tests.length ? <TestsTable tests={tests} /> : <EmptyState isCompact title="No physical tests yet" description="Sprint, endurance and jump results appear here once a coach records them." />}
        </VStack>
      </Card>
    </Grid>
  );
}

async function Overview({ id, p, attrs, plural, fit }: { id: string; p: Player; attrs: Map<string, Attribute>; plural: string; fit: React.ReactNode }) {
  const events = await db((tx) => tx<Ev[]>`
    select type, x::float8 as x, y::float8 as y, end_x::float8 as end_x, end_y::float8 as end_y, (extra ->> 'xg')::float8 as xg
    from events
    where player_id = ${id} and x is not null and (
      type in ('ball_recovery', 'shot')
      or (type = 'carry' and y >= 62 and end_y between 30 and 62 and end_x >= 80))`);
  const small = smallGroupNote(p.peers, p.role);
  const keys = Object.keys(p.per90);

  return (
    <VStack gap={4}>
      <StandoutQualities p={p} attrs={attrs} plural={plural} />

      {fit}

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={3}>
            <Heading level={3}>Percentiles vs {p.peers} {plural}</Heading>
            {grouped(keys).map(([g, ks], gi, all) => {
              const firstSlot = all.slice(0, gi).reduce((n, [, prev]) => n + prev.length, 0) + gi * GROUP_PAUSE_SLOTS;
              return (
                <VStack key={g} gap={1}>
                  <Text type="label" color="secondary">{g}</Text>
                  {ks.map((k, ri) => (
                    <Grid key={k} className="mrow" gap={2}>
                      <Text maxLines={1}>{metricLabel(k)}</Text>
                      <PctBar pct={p.percentiles[k]} i={firstSlot + ri} lowerIsBetter={LOWER_IS_BETTER.has(k)} />
                      <Text type="supporting" display="block" justify="end" hasTabularNumbers>{fmtMetric(k, p.per90[k])}</Text>
                      <Text weight="bold" display="block" justify="end"><Count value={p.percentiles[k]} i={firstSlot + ri} /></Text>
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
