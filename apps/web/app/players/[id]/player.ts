import type { Q } from "@/lib/auth";
import { latestTeam } from "@/lib/queries";
import type { MarketPlayer } from "./risk-market";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Header = {
  display_name: string; photo_url: string | null; photo_credit: string | null; photo_source_url: string | null; team: string | null;
  primary_position: string | null; birth_year: number | null; height_cm: number | null; preferred_foot: string | null;
  nationality: string | null; demo_fields: string[]; id_verified: boolean;
};
/** A player with a season of published match data. */
export type Player = Header & MarketPlayer & { has_style: boolean; per90: Record<string, number | null>; attr_percentiles: Record<string, number> };
/** A visible player nobody has match data for yet, such as one who signed up himself. */
export type PlayerWithoutData = Header & { role: null };

/** The profile as the caller may see it: his row with the most minutes, or only the header when he has none. */
export async function getPlayer(tx: Q, id: string): Promise<Player | PlayerWithoutData | null> {
  const [p] = await tx<(Player | PlayerWithoutData)[]>`
    select p.display_name, p.photo_url, p.photo_credit, p.photo_source_url, lt.team, p.primary_position, m.role, m.minutes, m.per90,
           m.percentiles, m.attr_percentiles, m.peers, m.style is not null as has_style,
           p.birth_year, p.height_cm, p.preferred_foot, p.nationality, p.demo_fields, p.id_verified,
           m.competition_id, m.age_band, m.band_percentiles, m.band_peers,
           (select count(*)::int from lineups l where l.player_id = p.id and l.minutes_played > 0) as matches
    from players p
    left join player_season_metrics m on m.player_id = p.id
    ${latestTeam(tx)}
    where p.id = ${id} and p.visible_to_scouts
    order by m.minutes desc nulls last limit 1`;
  return p ?? null;
}
