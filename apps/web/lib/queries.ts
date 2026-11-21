import { sql } from "./db";

// Team for alias `p` = the side they played for in their latest match. Exposes `lt.team`.
export const latestTeam = () => sql`
  left join lateral (
    select t.name as team from lineups l
    join matches mt on mt.id = l.match_id
    join teams t on t.id = l.team_id
    where l.player_id = p.id order by mt.kickoff_at desc limit 1
  ) lt on true`;
