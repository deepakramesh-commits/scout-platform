// The Python registry owns the keys; labels are derived so there is one source of truth.
export const label = (key: string) =>
  key === "xg" ? "xG" : key === "xt" ? "xT" : key === "cut_ins" ? "Cut-ins"
    : (key.charAt(0).toUpperCase() + key.slice(1)).replace(/_pct$/, "").replaceAll("_", " ");

export const metricKeys = async (q: import("./auth").Q) =>
  (await q<{ key: string }[]>`select distinct jsonb_object_keys(per90) as key from player_season_metrics order by 1`).map((r) => r.key);

// Presentation grouping only; keys missing here land in "Other" so a new Python metric still shows up.
export const GROUPS: [string, string[]][] = [
  ["Attacking", ["goals", "shots", "shots_on_target", "xg", "first_time_shots", "assists", "key_passes", "through_balls_received",
    "receptions_in_box", "crosses", "cut_ins", "dribbles_completed", "dribble_success_pct"]],
  ["Possession", ["touches", "passes", "passes_completed", "pass_accuracy_pct", "long_passes", "progressive_passes", "carries",
    "progressive_carries", "first_touch_under_pressure_pct", "ball_losses", "xt"]],
  ["Defending", ["pressures", "ball_recoveries", "interceptions", "tackles_won", "tackle_success_pct", "duels_won", "aerial_duels_won", "blocks"]],
  ["Goalkeeping", ["saves", "crosses_claimed"]],
];

export const LOWER_IS_BETTER = new Set(["ball_losses"]);

const isShare = (key: string) => key.endsWith("_pct");

export const unit = (key: string) => (isShare(key) ? "%" : "/ 90");

export const fmtMetric = (key: string, v: number | null | undefined) =>
  v == null ? "–" : isShare(key) ? `${Math.round(v)}%` : v.toFixed(2);

export const fmtWithUnit = (key: string, v: number | null | undefined) =>
  v == null || isShare(key) ? fmtMetric(key, v) : `${fmtMetric(key, v)} / 90`;

export const metricLabel = (key: string) => (LOWER_IS_BETTER.has(key) ? `${label(key)} (lower is better)` : label(key));

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

export const rolePlural = (role: string) => `${(ROLE_NAMES[role] ?? role).toLowerCase()}s`;

export const SMALL_GROUP = 10;
export const smallGroupNote = (peers: number, role: string) =>
  peers > 0 && peers < SMALL_GROUP ? `ranked among only ${peers} ${rolePlural(role)}` : null;

export const PRESETS = [
  { title: "Right wingers who cut inside", blurb: "Carries from the right flank into the half-space", role: "RW", sort: "cut_ins" },
  { title: "Ball-winning full-backs", blurb: "Most loose balls recovered per 90", role: "FB", sort: "ball_recoveries" },
  { title: "Midfield metronomes", blurb: "Central midfielders who see the ball most", role: "CM", sort: "touches" },
  { title: "Penalty-box threats", blurb: "Strikers ranked by expected goals per 90", role: "ST", sort: "xg" },
];
