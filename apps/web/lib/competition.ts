import type { Q } from "./auth";

export const MATCH_STATUS = { uploaded: "Video uploaded", tagging: "Being logged", review: "In review", published: "Published" } as const;
export type MatchStatus = keyof typeof MATCH_STATUS;
export type MatchRow = { id: string; kickoff_at: Date | null; status: MatchStatus; home_id: string; home: string; away_id: string; away: string; is_demo: boolean };

export const matchRows = (q: Q, by: { competition?: string; team?: string }) => q<MatchRow[]>`
  select m.id, m.kickoff_at, m.status, m.home_team_id as home_id, h.name as home, m.away_team_id as away_id, a.name as away, m.is_demo
  from matches m join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id
  where (${by.competition ?? null}::uuid is null or m.competition_id = ${by.competition ?? null})
    and (${by.team ?? null}::uuid is null or ${by.team ?? null} in (m.home_team_id, m.away_team_id))
  order by m.kickoff_at desc nulls first`;

/** A competition whose computed numbers a page reads; `name` includes the season. Percentiles never pool across competitions. */
export type RankedCompetition = { id: string; name: string; min_minutes: number };
export type PlayerCompetition = RankedCompetition & { minutes: number };

export const rankedCompetitions = (q: Q) => q<RankedCompetition[]>`
  select c.id, c.name || ' ' || c.season as name, c.min_minutes from competitions c
  where exists (select 1 from player_season_metrics m where m.competition_id = c.id)
  order by c.season desc, c.name`;

export const playerCompetitions = (q: Q, playerId: string) => q<PlayerCompetition[]>`
  select c.id, c.name || ' ' || c.season as name, c.min_minutes, sum(m.minutes)::int as minutes
  from player_season_metrics m join competitions c on c.id = m.competition_id
  where m.player_id = ${playerId}
  group by c.id order by minutes desc, c.season desc, c.name`;

export const pickCompetition = <T extends { id: string }>(options: T[], id: string | null | undefined): T | null =>
  options.find((o) => o.id === id) ?? options[0] ?? null;
