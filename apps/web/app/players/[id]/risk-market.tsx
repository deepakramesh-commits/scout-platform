import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db } from "@/lib/auth";
import { AVAILABILITY_LABEL, type Availability } from "@/lib/market-form";
import { grouped, LOWER_IS_BETTER, metricLabel, ROLE_NAMES, rolePlural } from "@/lib/metrics";
import { assessRisk, matchFoot, MIN_MATCHES, type RiskStatus } from "@/lib/risk";
import { getEditRights, getTests, SEASON_YEAR, type TestResult } from "@/lib/scouting";
import { Demo, PctBadge } from "../../ui";
import { AgeCurve, type AgePoint } from "./age-curve";

export type MarketPlayer = {
  display_name: string; role: string; minutes: number; matches: number; competition_id: string;
  birth_year: number | null; height_cm: number | null; preferred_foot: string | null; nationality: string | null;
  demo_fields: string[]; id_verified: boolean;
  percentiles: Record<string, number>; peers: number; age_band: string | null; band_percentiles: Record<string, number>; band_peers: number;
};
type Market = { contract_end: string | null; availability: Availability | null; transfer_conditions: string | null; representative: string | null; is_demo: boolean };
type MatchCell = { match_id: string; index: number; opponent_stronger: boolean; minutes: number; opponent: string; kickoff: Date | null };
type CurveRow = { id: string; display_name: string; birth_year: number; value: number };

// Band percentiles with fewer ranked players than this say nothing, so they are not shown.
const BAND_MIN_PEERS = 5;
const STATUS: Record<RiskStatus, { label: string; color: "green" | "yellow" | "default" }> = {
  good: { label: "Good", color: "green" }, caution: { label: "Caution", color: "yellow" }, unknown: { label: "Unknown", color: "default" },
};
const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const isoDate = (s: string) => date(new Date(`${s}T00:00:00Z`));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export async function RiskAndMarket({ id, p }: { id: string; p: MarketPlayer }) {
  const [[market], tests, cells, roles, [foot], [comp], curve, can] = await db((tx) => Promise.all([
    tx<Market[]>`select to_char(contract_end, 'YYYY-MM-DD') as contract_end, availability, transfer_conditions, representative, is_demo
                 from player_market where player_id = ${id}`,
    getTests(tx, id),
    tx<MatchCell[]>`
      select i.match_id, i.index, i.opponent_stronger, i.minutes, t.name as opponent, m.kickoff_at as kickoff
      from player_match_index i join matches m on m.id = i.match_id join teams t on t.id = i.opponent_team_id
      where i.player_id = ${id} order by m.kickoff_at nulls last`,
    tx<{ position: string }[]>`
      select position from lineups where player_id = ${id} and minutes_played > 0 and position is not null
      group by position order by sum(minutes_played) desc`,
    tx<{ right: number; left: number }[]>`
      select count(*) filter (where body_part = 'Right Foot')::int as right, count(*) filter (where body_part = 'Left Foot')::int as left
      from events where player_id = ${id} and type in ('pass', 'shot')`,
    tx<{ name: string; min_minutes: number }[]>`select name, min_minutes from competitions where id = ${p.competition_id}`,
    tx<CurveRow[]>`
      select p.id, p.display_name, p.birth_year,
             round((select avg(v::numeric) from jsonb_each_text(m.attr_percentiles) as e(k, v)))::int as value
      from player_season_metrics m join players p on p.id = m.player_id
      where m.role = ${p.role} and m.competition_id = ${p.competition_id} and m.attr_percentiles <> '{}' and p.birth_year is not null`,
    getEditRights(tx, id),
  ]));

  const ageDemo = p.demo_fields.includes("birth_year");
  const risk = assessRisk({
    matches: cells.map((c) => ({ index: c.index, stronger: c.opponent_stronger })),
    roles: roles.map((r) => ROLE_NAMES[r.position] ?? r.position),
    minutes: p.minutes, matchesPlayed: p.matches, minMinutes: comp?.min_minutes ?? 450,
    birthYear: p.birth_year, birthYearDemo: ageDemo, idVerified: p.id_verified,
    market: market ? { contractEnd: market.contract_end, availability: market.availability, transferConditions: market.transfer_conditions, demo: market.is_demo } : null,
    today: new Date(),
  });
  const fromMatch = matchFoot(foot ?? { right: 0, left: 0 });
  const demo = (field: string) => p.demo_fields.includes(field);
  const facts: { label: string; value: string | null; demo: boolean; note?: string }[] = [
    { label: "Age", value: p.birth_year == null ? "Age not recorded" : `${SEASON_YEAR - p.birth_year} (born ${p.birth_year})`, demo: p.birth_year != null && ageDemo },
    { label: "Height", value: p.height_cm == null ? null : `${p.height_cm} cm`, demo: demo("height_cm") },
    { label: "Preferred foot", value: p.preferred_foot && cap(p.preferred_foot), demo: demo("preferred_foot") },
    {
      label: "Foot in match data",
      value: fromMatch ? `${cap(fromMatch.foot)}, weaker foot ${fromMatch.weakShare}%` : null,
      demo: false,
      note: fromMatch ? `Match data: ${fromMatch.touches} passes and shots with a foot` : "Match data: too few passes and shots to tell",
    },
    { label: "Nationality", value: p.nationality, demo: false },
    { label: "Contract ends", value: market?.contract_end ? isoDate(market.contract_end) : null, demo: !!market?.is_demo },
    { label: "Availability", value: market?.availability ? AVAILABILITY_LABEL[market.availability] : null, demo: !!market?.is_demo },
    { label: "Transfer conditions", value: market?.transfer_conditions || null, demo: !!market?.is_demo },
    { label: "Representative", value: market?.representative || null, demo: !!market?.is_demo },
  ];
  const stronger = cells.filter((c) => c.opponent_stronger).map((c) => c.index);
  const weaker = cells.filter((c) => !c.opponent_stronger).map((c) => c.index);
  const plural = rolePlural(p.role);
  const points: AgePoint[] = curve.map((c) => ({ age: SEASON_YEAR - c.birth_year, value: c.value, name: c.display_name }));
  const meIdx = curve.findIndex((c) => c.id === id);

  return (
    <VStack gap={4}>
      <Card>
        <VStack gap={3}>
          <VStack gap={1}>
            <Heading level={2}>Risk</Heading>
            <Text type="supporting">What could make this signing fail, item by item. Unknown means we do not have the data yet, not that it is fine.</Text>
          </VStack>
          {risk.map((r, i) => (
            <VStack key={r.key} gap={2}>
              <VStack gap={0}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Text weight="semibold">{r.label}</Text>
                  <Token size="sm" label={STATUS[r.status].label} color={STATUS[r.status].color} />
                  {r.demo && <Demo />}
                </HStack>
                <Text type="supporting">{r.reason}</Text>
              </VStack>
              {i < risk.length - 1 && <Divider />}
            </VStack>
          ))}
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <VStack gap={1}>
            <Heading level={2}>Match by match</Heading>
            <Text type="supporting">
              The index compares each of his matches with every match by a player in the same role: his actions per 90 minutes, with ball losses counted against him, averaged and ranked from 0 to 100.
              Only matches of 30 minutes or more count, and a stronger opponent is one with a better goal difference per match in the competition than his own team.
            </Text>
          </VStack>
          {cells.length === 0 ? (
            <EmptyState isCompact title="No rated matches yet" description="A match counts once he plays 30 minutes or more in it." />
          ) : (
            <>
              <Grid columns={{ minWidth: 160, repeat: "fit" }} gap={3}>
                <Split label="Against stronger sides" values={stronger} />
                <Split label="Against weaker sides" values={weaker} />
              </Grid>
              {cells.length < MIN_MATCHES && <Text type="supporting">Only {cells.length} rated {cells.length === 1 ? "match" : "matches"}: too few to read a pattern.</Text>}
              <Grid columns={{ minWidth: 112, repeat: "fill" }} gap={2}>
                {cells.map((c) => (
                  <Card key={c.match_id} variant="muted" padding={2}>
                    <VStack gap={1}>
                      <HStack hAlign="between" vAlign="center" gap={1}>
                        <PctBadge pct={c.index} />
                        <Text type="supporting" size="xsm">{c.kickoff ? shortDate(c.kickoff) : "No date"}</Text>
                      </HStack>
                      <Text size="sm" maxLines={1}>v {c.opponent}</Text>
                      <Text type="supporting" size="xsm">{c.opponent_stronger ? "Stronger side" : "Weaker side"} · {c.minutes}′</Text>
                    </VStack>
                  </Card>
                ))}
              </Grid>
            </>
          )}
        </VStack>
      </Card>

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={3}>
            <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
              <Heading level={2}>Market</Heading>
              {(can.market || can.player) && <Button size="sm" label="Edit" href={`/players/${id}/market`} />}
            </HStack>
            {facts.map((f) => (
              <VStack key={f.label} gap={0}>
                <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                  <Text color="secondary">{f.label}</Text>
                  <HStack gap={1} vAlign="center">
                    <Text weight="semibold">{f.value ?? "Not recorded"}</Text>
                    {f.value != null && f.demo && <Demo />}
                  </HStack>
                </HStack>
                {f.note && <Text type="supporting" size="xsm">{f.note}</Text>}
              </VStack>
            ))}
          </VStack>
        </Card>
        <Card>
          <VStack gap={3}>
            <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
              <Heading level={2} id="tests">Physical tests</Heading>
              {can.addTest && <Button size="sm" label="Add a test" href={`/players/${id}/market#tests`} />}
            </HStack>
            {tests.length ? <TestsTable tests={tests} /> : <EmptyState isCompact title="No physical tests yet" description="Sprint, endurance and jump results appear here once a coach records them." />}
            <Text type="supporting">Each kind shows his latest result. Percentile is among every player's latest test of that kind; for sprints, faster ranks higher. Verified means an admin or the federation checked it.</Text>
          </VStack>
        </Card>
      </Grid>

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={3}>
            <VStack gap={1}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={2}>Age band</Heading>
                {p.age_band && <Token size="sm" label={p.age_band === "senior" ? "Senior" : p.age_band} />}
                {ageDemo && p.age_band && <Demo />}
              </HStack>
              <Text type="supporting">
                Percentiles against {plural} of his own age band (U17, U19, U21, senior) as well as against all ages. Bands run on demo birth years until real ones are recorded.
              </Text>
            </VStack>
            <BandTable p={p} plural={plural} />
          </VStack>
        </Card>
        <Card>
          <VStack gap={3}>
            <VStack gap={1}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={2}>Age curve</Heading>
                <Demo />
              </HStack>
              <Text type="supporting">
                Every ranked {(ROLE_NAMES[p.role] ?? p.role).toLowerCase()} in {comp?.name ?? "the competition"} by age and mean attribute percentile.
                {meIdx >= 0 ? ` ${p.display_name} is the orange diamond.` : ""} Built on demo ages, so read the shape, not the details.
              </Text>
            </VStack>
            {points.length >= 3
              ? <AgeCurve others={points.filter((_, i) => i !== meIdx)} me={meIdx >= 0 ? points[meIdx] : null} />
              : <EmptyState isCompact title="Too few ranked players" description={`An age curve needs at least 3 ranked ${plural} with a birth year.`} />}
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}

function Split({ label, values }: { label: string; values: number[] }) {
  const v = avg(values);
  return (
    <Card variant="muted" padding={3}>
      <VStack gap={0}>
        <Text type="supporting">{label}</Text>
        <Heading level={3}>{v ?? "–"}</Heading>
        <Text type="supporting">{values.length ? `mean index over ${values.length} ${values.length === 1 ? "match" : "matches"}` : "no matches"}</Text>
      </VStack>
    </Card>
  );
}

function BandTable({ p, plural }: { p: MarketPlayer; plural: string }) {
  if (!p.age_band) return <EmptyState isCompact title="No age band" description="Age not recorded, so he is ranked only against all ages." />;
  if (p.band_peers < BAND_MIN_PEERS) {
    const band = p.age_band === "senior" ? "senior" : p.age_band;
    return (
      <EmptyState isCompact title="Too few peers in his band"
        description={`Only ${p.band_peers} ranked ${band} ${plural}; band percentiles need at least ${BAND_MIN_PEERS}. He is ranked against all ages instead.`} />
    );
  }
  if (p.band_peers === p.peers) {
    return <Text type="supporting">Every ranked {(ROLE_NAMES[p.role] ?? p.role).toLowerCase()} in this competition is in his band, so his band percentiles are the same as across all ages (see Overview).</Text>;
  }
  const keys = grouped(Object.keys(p.band_percentiles)).flatMap(([, ks]) => ks);
  return (
    <VStack gap={2}>
      <Text type="supporting">Ranked among {p.band_peers} {p.age_band === "senior" ? "senior" : p.age_band} {plural}.</Text>
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Measure</TableHeaderCell>
            <TableHeaderCell><Text type="inherit" display="block" justify="end">All ages</Text></TableHeaderCell>
            <TableHeaderCell><Text type="inherit" display="block" justify="end">His band</Text></TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((k) => (
            <TableRow key={k}>
              <TableCell><Text>{metricLabel(k)}</Text></TableCell>
              <TableCell><HStack hAlign="end"><PctBadge pct={p.percentiles[k]} lowerIsBetter={LOWER_IS_BETTER.has(k)} /></HStack></TableCell>
              <TableCell><HStack hAlign="end"><PctBadge pct={p.band_percentiles[k]} lowerIsBetter={LOWER_IS_BETTER.has(k)} /></HStack></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </VStack>
  );
}

function TestsTable({ tests }: { tests: TestResult[] }) {
  return (
    <Table density="compact" style={{ minWidth: "26rem" }}>
      <TableHeader>
        <TableRow>
          <TableHeaderCell style={{ width: "40%" }}>Test</TableHeaderCell>
          <TableHeaderCell><Text type="inherit" display="block" justify="end">Result</Text></TableHeaderCell>
          <TableHeaderCell>Tested</TableHeaderCell>
          <TableHeaderCell><Text type="inherit" display="block" justify="end">Percentile</Text></TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tests.map((t) => (
          <TableRow key={t.test}>
            <TableCell>
              <VStack gap={0}>
                <Text>{t.label}</Text>
                <HStack gap={1} vAlign="center">
                  <Token size="sm" label={t.verified ? "Verified" : "Not verified"} color={t.verified ? "green" : "default"} />
                  {t.is_demo && <Demo />}
                </HStack>
              </VStack>
            </TableCell>
            <TableCell><Text display="block" justify="end" hasTabularNumbers>{t.value} {t.unit}</Text></TableCell>
            <TableCell><Text type="supporting">{date(t.tested_at)}</Text></TableCell>
            <TableCell><HStack hAlign="end"><PctBadge pct={t.pct} /></HStack></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
