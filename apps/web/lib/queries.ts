import type { Q } from "./auth";
import { rankedCompetitions } from "./competition";
import { label, LOWER_IS_BETTER, metricKeys } from "./metrics";
import { SEASON_YEAR } from "./scouting";
import { describeSearch, parseSearch, type SearchFilters } from "./search";

// Team for alias `p` = the side they played for in their latest match. Exposes `lt.team`.
export const latestTeam = (q: Q) => q`
  left join lateral (
    select t.name as team from lineups l
    join matches mt on mt.id = l.match_id
    join teams t on t.id = l.team_id
    where l.player_id = p.id order by mt.kickoff_at desc limit 1
  ) lt on true`;

export type SearchRow = {
  id: string; display_name: string; photo_url: string | null; team: string | null; role: string; minutes: number;
  value: number | null; pct: number | null; peers: number; attr_percentiles: Record<string, number>; id_verified: boolean;
};

export const searchRows = (q: Q, f: SearchFilters, limit = 100) => {
  const sort = f.sort;
  if (!sort) return Promise.resolve([] as SearchRow[]);
  const ascending = LOWER_IS_BETTER.has(sort);
  return q<SearchRow[]>`
    select p.id, p.display_name, p.photo_url, lt.team, m.role, m.minutes, p.id_verified,
           (m.per90 ->> ${sort})::float8 as value, (m.percentiles ->> ${sort})::int as pct, m.peers, m.attr_percentiles
    from player_season_metrics m
    join players p on p.id = m.player_id
    left join player_market pm on pm.player_id = p.id
    ${latestTeam(q)}
    where p.visible_to_scouts and m.competition_id = ${f.competition}
      and (${f.role}::text is null or m.role = ${f.role})
      and (${f.name}::text is null or p.display_name ilike '%' || ${f.name} || '%')
      and m.minutes >= ${f.minMinutes ?? 0}
      and (${f.minPct}::int is null or (case when ${ascending} then 100 - (m.percentiles ->> ${sort})::int else (m.percentiles ->> ${sort})::int end) >= ${f.minPct})
      and (${f.country}::text is null or p.nationality = ${f.country})
      and (${f.ageMin}::int is null or ${SEASON_YEAR} - p.birth_year >= ${f.ageMin})
      and (${f.ageMax}::int is null or ${SEASON_YEAR} - p.birth_year <= ${f.ageMax})
      and (${f.contractBy}::date is null or pm.contract_end <= ${f.contractBy}::date)
    order by (m.percentiles ->> ${sort}) is null, case when ${ascending} then (m.per90 ->> ${sort})::float8 end asc nulls last, value desc nulls last, p.display_name
    limit ${limit}`;
};

export const searchOptions = async (q: Q) => {
  const [keys, roles, countries, competitions] = await Promise.all([
    metricKeys(q),
    q<{ role: string }[]>`select distinct role from player_season_metrics order by 1`.then((rs) => rs.map((r) => r.role)),
    q<{ c: string }[]>`select distinct nationality as c from players where nationality is not null and visible_to_scouts order by 1`.then((rs) => rs.map((r) => r.c)),
    rankedCompetitions(q),
  ]);
  return { keys, roles, countries, competitions };
};

export async function currentMatches(q: Q, query: string) {
  const options = await searchOptions(q);
  const filters = parseSearch(Object.fromEntries(new URLSearchParams(query)), options);
  const rows = await searchRows(q, filters, 5000);
  const competition = (id: string) => options.competitions.find((c) => c.id === id)?.name ?? "not in your plan";
  return { filters, ids: [...new Set(rows.map((r) => r.id))], description: describeSearch(filters, { metric: label, competition }) };
}
