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
