// The Python registry owns the keys; labels are derived so there is one source of truth.
export const label = (key: string) =>
  key === "xg" ? "xG" : key === "cut_ins" ? "Cut-ins" : key.charAt(0).toUpperCase() + key.slice(1).replaceAll("_", " ");

export const metricKeys = async (sql: import("postgres").Sql) =>
  (await sql<{ key: string }[]>`select distinct jsonb_object_keys(per90) as key from player_season_metrics order by 1`).map((r) => r.key);

// Presentation grouping only; keys missing here land in "Other" so a new Python metric still shows up.
export const GROUPS: [string, string[]][] = [
  ["Attacking", ["shots", "xg", "key_passes", "crosses", "cut_ins", "dribbles_completed"]],
  ["Possession", ["touches", "passes", "passes_completed", "progressive_passes", "carries", "progressive_carries"]],
  ["Defending", ["ball_recoveries", "interceptions", "tackles_won", "duels_won"]],
];

export const grouped = (keys: string[]): [string, string[]][] => {
  const known = new Set(GROUPS.flatMap(([, ks]) => ks));
  const other = keys.filter((k) => !known.has(k));
  return [...GROUPS.map(([g, ks]) => [g, ks.filter((k) => keys.includes(k))] as [string, string[]]), ["Other", other] as [string, string[]]]
    .filter(([, ks]) => ks.length > 0);
};

export const ROLE_NAMES: Record<string, string> = {
  GK: "Goalkeeper", CB: "Centre-back", FB: "Full-back", DM: "Defensive midfielder", CM: "Central midfielder",
  AM: "Attacking midfielder", LW: "Left winger", RW: "Right winger", ST: "Striker",
};

export const PRESETS = [
  { title: "Right wingers who cut inside", blurb: "Carries from the right flank into the half-space", role: "RW", sort: "cut_ins" },
  { title: "Ball-winning full-backs", blurb: "Most loose balls recovered per 90", role: "FB", sort: "ball_recoveries" },
  { title: "Midfield metronomes", blurb: "Central midfielders who see the ball most", role: "CM", sort: "touches" },
  { title: "Penalty-box threats", blurb: "Strikers ranked by expected goals per 90", role: "ST", sort: "xg" },
];
