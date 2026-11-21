import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import type { SelectorSection } from "@astryxdesign/core/Selector";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { sql } from "@/lib/db";
import { fmtMetric, grouped, label, LOWER_IS_BETTER, ROLE_NAMES } from "@/lib/metrics";
import { latestTeam } from "@/lib/queries";
import { flag, PctBar, PlayerAvatar } from "../ui";
import { Pickers } from "./pickers";
import { PercentileRadar } from "./radar";

export const dynamic = "force-dynamic";

type Option = { id: string; display_name: string; role: string };
type Side = { id: string; display_name: string; photo_url: string | null; team: string | null; role: string; minutes: number; per90: Record<string, number | null>; percentiles: Record<string, number> };

const SERIES = { a: "var(--color-data-categorical-teal)", b: "var(--color-data-categorical-orange)" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pick = (v: string | string[] | undefined) => { const s = Array.isArray(v) ? v[0] : v; return s && UUID.test(s) ? s : null; };

async function load(id: string | null) {
  if (!id) return null;
  const [s] = await sql<Side[]>`
    select p.id, p.display_name, p.photo_url, lt.team, m.role, m.minutes, m.per90, m.percentiles
    from players p join player_season_metrics m on m.player_id = p.id
    ${latestTeam()}
    where p.id = ${id} and p.visible_to_scouts
    order by m.minutes desc limit 1`;
  return s ?? null;
}

// A player can qualify in two positions; the picker lists them once, under the first.
function sectionsOf(options: Option[], current: (Side | null)[]): SelectorSection[] {
  const seen = new Set<string>();
  const byRole = new Map<string, SelectorSection>();
  for (const o of options) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    const section = byRole.get(o.role) ?? byRole.set(o.role, { type: "section", title: ROLE_NAMES[o.role] ?? o.role, options: [] }).get(o.role)!;
    section.options.push({ value: o.id, label: o.display_name });
  }
  const extra = current.filter((s): s is Side => !!s && !seen.has(s.id)).map((s) => ({ value: s.id, label: s.display_name }));
  return extra.length ? [{ type: "section", title: "Below the minutes cut-off", options: extra }, ...byRole.values()] : [...byRole.values()];
}

export default async function Compare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const [options, a, b] = await Promise.all([
    sql<Option[]>`
      select p.id, p.display_name, m.role from player_season_metrics m join players p on p.id = m.player_id
      where m.style is not null and p.visible_to_scouts order by m.role, p.display_name`,
    load(pick(q.a)),
    load(pick(q.b)),
  ]);

  const side = (s: Side, key: "a" | "b") => (
    <ClickableCard className="lift" label={s.display_name} href={`/players/${s.id}`} variant="transparent" padding={2}>
      <HStack gap={3} vAlign="center" hAlign={key === "b" ? "end" : "start"}>
        {key === "a" && <PlayerAvatar name={s.display_name} photo={s.photo_url} size={72} />}
        <VStack gap={0} hAlign={key === "b" ? "end" : "start"}>
          <HStack gap={1} vAlign="center">
            <svg viewBox="0 0 10 10" className="dot" aria-hidden><circle cx="5" cy="5" r="5" fill={SERIES[key]} /></svg>
            <Heading level={2}>{s.display_name}</Heading>
          </HStack>
          <Text color="secondary">{flag(s.team)} {s.team} · {ROLE_NAMES[s.role] ?? s.role} · {s.minutes} min</Text>
        </VStack>
        {key === "b" && <PlayerAvatar name={s.display_name} photo={s.photo_url} size={72} />}
      </HStack>
    </ClickableCard>
  );

  const groups = a && b ? grouped(Object.keys(a.per90)) : [];
  // The radar reads "further out is better", so it leaves out lower-is-better metrics and any metric either player lacks.
  const radar = a && b
    ? groups.flatMap(([, ks]) => ks)
        .filter((k) => !LOWER_IS_BETTER.has(k) && a.percentiles[k] != null && b.percentiles[k] != null)
        .map((k) => ({ metric: label(k), a: a.percentiles[k], b: b.percentiles[k] }))
    : [];

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Compare players</Heading>
        <Text color="secondary">Head to head on every measure. Percentiles are within each player’s own position; numbers are per 90 minutes.</Text>
      </VStack>

      <Card>
        <Pickers key={`${a?.id}-${b?.id}`} sections={sectionsOf(options, [a, b])} a={a?.id ?? null} b={b?.id ?? null} />
      </Card>

      {a && b ? (
        <>
          <Card elevation="low">
            <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={3} align="center">
              {side(a, "a")}
              {side(b, "b")}
            </Grid>
          </Card>
          {a.role !== b.role && <Text type="supporting">Different positions: each percentile is against that player’s own position.</Text>}

          <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
            <Card>
              <VStack gap={2}>
                <Heading level={3}>Percentile shape</Heading>
                <Text type="supporting">{radar.length} measures both players have, clockwise from attacking to defending. Further out is better.</Text>
                <PercentileRadar colors={SERIES} data={radar} />
              </VStack>
            </Card>

            <Card>
              <VStack gap={3}>
                <Heading level={3}>Head to head</Heading>
                {groups.map(([g, ks], gi, all) => {
                  const before = all.slice(0, gi).reduce((n, [, prev]) => n + prev.length, 0);
                  return (
                    <VStack key={g} gap={1}>
                      <Text type="label" color="secondary" display="block" justify="center">{g}</Text>
                      {ks.map((k, ri) => {
                        const [va, vb] = [a.per90[k], b.per90[k]];
                        const better = (x: number | null, y: number | null) =>
                          x != null && (y == null || (LOWER_IS_BETTER.has(k) ? x < y : x > y));
                        const slot = { "--i": before + ri } as React.CSSProperties;
                        return (
                          <Grid key={k} className="cmp" gap={2}>
                            <Text weight="bold" hasTabularNumbers className={better(va, vb) ? "win" : undefined} style={slot}>{fmtMetric(k, va)}</Text>
                            <PctBar lowerIsBetter={LOWER_IS_BETTER.has(k)} pct={a.percentiles[k]} flip i={before + ri} />
                            <Text type="supporting" display="block" justify="center" maxLines={1}>{label(k)}</Text>
                            <PctBar lowerIsBetter={LOWER_IS_BETTER.has(k)} pct={b.percentiles[k]} i={before + ri} />
                            <Text weight="bold" hasTabularNumbers display="block" justify="end" className={better(vb, va) ? "win" : undefined} style={slot}>{fmtMetric(k, vb)}</Text>
                          </Grid>
                        );
                      })}
                    </VStack>
                  );
                })}
                <Divider />
                <Text type="supporting">Bars are percentiles; figures are per 90 minutes, or a share of attempts where marked %. The green figure is the better one (fewer, for ball losses). “–” means too few attempts to judge.</Text>
              </VStack>
            </Card>
          </Grid>
        </>
      ) : (
        <Card variant="muted">
          <Text color="secondary">Pick two players above, or open a player profile and press “Compare”.</Text>
        </Card>
      )}
    </VStack>
  );
}
