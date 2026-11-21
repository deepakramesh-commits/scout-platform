import { sql } from "./db";
import type { Evidence, FitItem } from "./fit";

export type Source = "match" | "partly_match" | "scout" | "physical_test";
export type AttributeGroup = "technical" | "physical" | "tactical" | "mental";

export const SOURCE_LABEL: Record<Source, string> = {
  match: "Match data", partly_match: "Partly match data", scout: "Scout rating", physical_test: "Physical test",
};
export const GROUP_ORDER: AttributeGroup[] = ["technical", "physical", "tactical", "mental"];

export type Attribute = {
  key: string; label: string; grp: AttributeGroup; source: Source; metrics: string[]; test: string | null; description: string;
};

export type Profile = {
  id: string; name: string; club: string | null; positions: string[]; age_min: number | null; age_max: number | null;
  is_draft: boolean; note: string | null; items: FitItem[];
};

/** Evidence per attribute, plus the attributes whose evidence comes from a demo row. */
export type PlayerEvidence = { evidence: Record<string, Evidence>; demo: Set<string> };

/** The brief fixes ages to this season; a null birth year is "age not recorded". */
export const SEASON_YEAR = 2026;

export const draftLabel = (p: Pick<Profile, "is_draft" | "club">) =>
  p.is_draft ? `Draft until ${p.club ?? "the club"} confirms` : null;

export const ageRange = ({ age_min: lo, age_max: hi }: Pick<Profile, "age_min" | "age_max">) =>
  lo != null && hi != null ? `aged ${lo} to ${hi}` : lo != null ? `aged ${lo} or over` : hi != null ? `aged ${hi} or under` : null;

export const getAttributes = () =>
  sql<Attribute[]>`select key, label, grp, source, metrics, test, description from attributes order by sort`;

export const getProfiles = () =>
  sql<Profile[]>`
    select r.id, r.name, r.club, r.positions, r.age_min, r.age_max, r.is_draft, r.note,
           coalesce(jsonb_agg(jsonb_build_object('attribute', i.attribute, 'priority', i.priority)
             order by array_position('{very_high,high,medium}'::text[], i.priority), a.sort)
             filter (where i.attribute is not null), '[]') as items
    from requirement_profiles r
    left join requirement_items i on i.profile_id = r.id
    left join attributes a on a.key = i.attribute
    group by r.id
    order by r.created_at, r.id`;

/**
 * CTE `ranked`: each player's latest test of each kind, with its percentile among every player's latest test of
 * that kind. A fast sprint ranks high: kinds where lower is better are ordered by the negated value.
 */
const rankedTests = () => sql`
  latest as (
    select distinct on (player_id, test) player_id, test, value, unit, tested_at, verified, is_demo
    from physical_tests order by player_id, test, tested_at desc
  ), ranked as (
    select l.*, k.label, round(100 * cume_dist() over (
             partition by l.test order by case when k.lower_is_better then -l.value else l.value end))::int as pct
    from latest l join physical_test_kinds k on k.key = l.test
  )`;

export type TestResult = {
  test: string; label: string; value: number; unit: string; tested_at: Date; verified: boolean; is_demo: boolean; pct: number;
};

export const getTests = (playerId: string) =>
  sql<TestResult[]>`
    with ${rankedTests()}
    select test, label, value::float8 as value, unit, tested_at, verified, is_demo, pct
    from ranked where player_id = ${playerId} order by label`;

/**
 * Fit evidence for a set of players.
 * - match: the attribute percentile of the player's main row (most minutes). Real data only.
 * - test: percentile of the player's latest test among every player's latest test of that kind.
 * - scout: none yet. Phase 2 adds `scout_ratings`; its mean rating x 10 goes in `scout` here.
 */
export async function getEvidence(playerIds: string[]): Promise<Map<string, PlayerEvidence>> {
  const out = new Map<string, PlayerEvidence>(playerIds.map((id) => [id, { evidence: {}, demo: new Set() }]));
  if (!playerIds.length) return out;
  const [main, tests] = await Promise.all([
    sql<{ player_id: string; attr_percentiles: Record<string, number> }[]>`
      select distinct on (player_id) player_id, attr_percentiles
      from player_season_metrics where player_id = any(${playerIds}::uuid[])
      order by player_id, minutes desc`,
    sql<{ player_id: string; attribute: string; pct: number; is_demo: boolean }[]>`
      with ${rankedTests()}
      select r.player_id, a.key as attribute, r.pct, r.is_demo
      from ranked r join attributes a on a.test = r.test
      where r.player_id = any(${playerIds}::uuid[])`,
  ]);
  for (const m of main) {
    const ev = out.get(m.player_id)!.evidence;
    for (const [attr, pct] of Object.entries(m.attr_percentiles)) ev[attr] = { ...ev[attr], match: pct };
  }
  for (const t of tests) {
    const pe = out.get(t.player_id)!;
    pe.evidence[t.attribute] = { ...pe.evidence[t.attribute], test: t.pct };
    if (t.is_demo) pe.demo.add(t.attribute);
  }
  return out;
}
