import type { Q } from "./auth";
import type { Evidence, FitItem } from "./fit";
import type { Recommendation } from "./report-form";

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

export type PlayerEvidence = { evidence: Record<string, Evidence>; demo: Set<string> };

export const SEASON_YEAR = new Date().getUTCFullYear();

export const draftLabel = (p: Pick<Profile, "is_draft" | "club">) =>
  p.is_draft ? `Draft until ${p.club ?? "the club"} confirms` : null;

export const ageRange = ({ age_min: lo, age_max: hi }: Pick<Profile, "age_min" | "age_max">) =>
  lo != null && hi != null ? `aged ${lo} to ${hi}` : lo != null ? `aged ${lo} or over` : hi != null ? `aged ${hi} or under` : null;

export const getAttributes = (q: Q) =>
  q<Attribute[]>`select key, label, grp, source, metrics, test, description from attributes order by sort`;

export const getProfiles = (q: Q) =>
  q<Profile[]>`
    select r.id, r.name, r.club, r.positions, r.age_min, r.age_max, r.is_draft, r.note,
           coalesce(jsonb_agg(jsonb_build_object('attribute', i.attribute, 'priority', i.priority)
             order by array_position('{very_high,high,medium}'::text[], i.priority), a.sort)
             filter (where i.attribute is not null), '[]') as items
    from requirement_profiles r
    left join requirement_items i on i.profile_id = r.id
    left join attributes a on a.key = i.attribute
    group by r.id
    order by r.created_at, r.id`;

/** The profile asked for, else the first one for his position, else the first. */
export const pickProfile = (profiles: Profile[], id: string | undefined | null, role: string | null) =>
  profiles.find((r) => r.id === id) ?? profiles.find((r) => role != null && r.positions.includes(role)) ?? profiles[0];

// Ranked among every player's latest test of the kind, whoever is looking (app.test_percentiles is security definer).
const rankedTests = (q: Q, ids: string[]) => q`ranked as (select * from app.test_percentiles(${ids}::uuid[]))`;

export type TestResult = {
  test: string; label: string; value: number; unit: string; tested_at: Date; verified: boolean; is_demo: boolean; pct: number;
};

export const getTests = (q: Q, playerId: string) =>
  q<TestResult[]>`
    with ${rankedTests(q, [playerId])}
    select test, label, value::float8 as value, unit, tested_at, verified, is_demo, pct
    from ranked order by label`;

export async function getEvidence(q: Q, playerIds: string[]): Promise<Map<string, PlayerEvidence>> {
  const out = new Map<string, PlayerEvidence>(playerIds.map((id) => [id, { evidence: {}, demo: new Set() }]));
  if (!playerIds.length) return out;
  const [main, tests, scouts] = await Promise.all([
    q<{ player_id: string; attr_percentiles: Record<string, number> }[]>`
      select distinct on (player_id) player_id, attr_percentiles
      from player_season_metrics where player_id = any(${playerIds}::uuid[])
      order by player_id, minutes desc`,
    q<{ player_id: string; attribute: string; pct: number; is_demo: boolean }[]>`
      with ${rankedTests(q, playerIds)}
      select r.player_id, a.key as attribute, r.pct, r.is_demo
      from ranked r join attributes a on a.test = r.test`,
    q<{ player_id: string; attribute: string; scout: number; is_demo: boolean }[]>`
      select r.player_id, s.attribute, round(avg(s.rating) * 10)::int as scout, bool_or(r.is_demo) as is_demo
      from scout_ratings s join scout_reports r on r.id = s.report_id
      where r.player_id = any(${playerIds}::uuid[]) and r.org_id = app.org()
      group by r.player_id, s.attribute`,
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
  for (const s of scouts) {
    const pe = out.get(s.player_id)!;
    pe.evidence[s.attribute] = { ...pe.evidence[s.attribute], scout: s.scout };
    if (s.is_demo) pe.demo.add(s.attribute);
  }
  return out;
}

export type ScoutReport = {
  id: string; author_id: string; author: string | null; created_at: Date; updated_at: Date; seen_in: string;
  recommendation: Recommendation; strengths: string; weaknesses: string; comments: string; is_demo: boolean;
  ratings: Record<string, number>;
};

export const getReports = (q: Q, playerId: string) =>
  q<ScoutReport[]>`
    select r.id, r.author_id, u.display_name as author, r.created_at, r.updated_at, r.seen_in, r.recommendation,
           r.strengths, r.weaknesses, r.comments, r.is_demo,
           coalesce((select jsonb_object_agg(s.attribute, s.rating) from scout_ratings s where s.report_id = r.id), '{}') as ratings
    from scout_reports r left join app_users u on u.id = r.author_id
    where r.player_id = ${playerId}
    order by r.created_at desc`;

export type EditRights = { market: boolean; player: boolean; addTest: boolean; verifyTest: boolean };

export async function getEditRights(q: Q, playerId: string): Promise<EditRights> {
  const [r] = await q<{ admin: boolean; owner: boolean; agent: boolean; federation: boolean }[]>`
    select app.is_admin() as admin, app.owns_player(${playerId}) as owner,
           exists (select 1 from agent_clients a where a.player_id = ${playerId} and a.org_id = app.org()) as agent,
           coalesce(app.role() = 'federation' and app.sees_player(${playerId}), false) as federation`;
  return {
    market: r.admin || r.owner || r.agent,
    player: r.admin || r.owner,
    addTest: r.admin || r.owner || r.federation,
    verifyTest: r.admin || r.federation,
  };
}
