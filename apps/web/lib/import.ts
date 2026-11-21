// Import of events logged in another tool: a documented CSV layout, and StatsBomb-style JSON.
// Players resolve through the match sheet; every row is checked against the event spec; one bad row and nothing
// is imported, because a partial import corrupts a match silently. Pure: relative .ts imports only.
import { checkEvent, normalise, SPEC_BY_TYPE, type LoggedEvent } from "./event-spec.ts";

/** The CSV layout, in column order. Documented on the import screen and in docs/import-csv.md. */
export const CSV_COLUMNS = [
  ["period", "1 to 4"],
  ["clock", "match clock as mm:ss, e.g. 12:07"],
  ["team", "home, away, or the team name"],
  ["shirt", "shirt number from the match sheet"],
  ["type", "event type from the event spec, e.g. pass"],
  ["outcome", "outcome value from the event spec, empty when the type has none"],
  ["x", "0 to 120, attacking toward 120"],
  ["y", "0 to 80"],
  ["end_x", "pass and carry only"],
  ["end_y", "pass and carry only"],
  ["body_part", "Right Foot, Left Foot, Head or Other"],
  ["flags", "semicolon list, e.g. under_pressure;cross"],
  ["set_piece", "corner, free_kick, throw_in, goal_kick, kick_off or penalty"],
  ["card", "yellow_card, second_yellow or red_card (fouls)"],
  ["gk_type", "shot_saved, collected, punch, keeper_sweeper or goal_conceded (goalkeeper actions)"],
] as const;

export type SheetPlayer = { player_id: string; team_id: string; shirt_number: number | null; display_name: string };
export type MatchContext = { home: { id: string; name: string }; away: { id: string; name: string }; players: SheetPlayer[] };
export type ImportedEvent = LoggedEvent & { player_id: string; team_id: string; period: number; video_seconds: number };
export type ImportError = { row: number; message: string };
export type ImportResult = { events: ImportedEvent[]; errors: ImportError[]; skipped: number };

/** RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const num = (s: string | undefined) => (s == null || s.trim() === "" ? null : Number(s));

function teamOf(ctx: MatchContext, value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v === "home" || v === ctx.home.name.toLowerCase()) return ctx.home.id;
  if (v === "away" || v === ctx.away.name.toLowerCase()) return ctx.away.id;
  return null;
}

function finish(rows: { row: number; event: ImportedEvent }[], errors: ImportError[], skipped: number): ImportResult {
  for (const { row, event } of rows) for (const m of checkEvent(event)) errors.push({ row, message: m });
  return { events: errors.length ? [] : rows.map((r) => r.event), errors, skipped };
}

export function importCsv(text: string, ctx: MatchContext): ImportResult {
  const [header, ...body] = parseCsv(text);
  const expected = CSV_COLUMNS.map(([c]) => c);
  const cols = (header ?? []).map((h) => h.trim().toLowerCase());
  const missing = expected.filter((c) => !cols.includes(c));
  if (missing.length) return { events: [], errors: [{ row: 1, message: `missing columns: ${missing.join(", ")}` }], skipped: 0 };
  const errors: ImportError[] = [];
  const rows: { row: number; event: ImportedEvent }[] = [];
  body.forEach((cells, i) => {
    const row = i + 2;
    const get = (c: string) => (cells[cols.indexOf(c)] ?? "").trim();
    const fail = (message: string) => errors.push({ row, message });
    const period = Number(get("period"));
    if (![1, 2, 3, 4].includes(period)) return fail(`period "${get("period")}" must be 1 to 4`);
    const clock = /^(\d{1,3}):([0-5]\d)$/.exec(get("clock"));
    if (!clock) return fail(`clock "${get("clock")}" must be mm:ss`);
    const team_id = teamOf(ctx, get("team"));
    if (!team_id) return fail(`team "${get("team")}" is neither ${ctx.home.name} nor ${ctx.away.name}`);
    const shirt = Number(get("shirt"));
    const player = ctx.players.find((p) => p.team_id === team_id && p.shirt_number === shirt);
    if (!player) return fail(`no player with shirt ${get("shirt")} on the match sheet for that team`);
    const type = get("type");
    if (!SPEC_BY_TYPE[type]) return fail(`unknown event type "${type}"`);
    const extra: Record<string, unknown> = {};
    for (const f of get("flags").split(";").map((s) => s.trim()).filter(Boolean)) extra[f] = true;
    for (const k of ["set_piece", "card", "gk_type"]) if (get(k)) extra[k] = get(k);
    const numbers = ["x", "y", "end_x", "end_y"].map((k) => num(get(k)));
    if (numbers.some((n) => n != null && Number.isNaN(n))) return fail("x, y, end_x and end_y must be numbers");
    const [x, y, end_x, end_y] = numbers;
    rows.push({
      row,
      event: {
        ...normalise({ type, outcome: get("outcome") || null, x, y, end_x, end_y, body_part: get("body_part") || null, extra }),
        player_id: player.player_id, team_id, period, video_seconds: Number(clock[1]) * 60 + Number(clock[2]),
      },
    });
  });
  return finish(rows, errors, 0);
}

type Named = { id?: number; name: string };
type SbEvent = {
  type: Named; period: number; minute: number; second: number; team: Named; player?: Named; location?: number[];
  under_pressure?: boolean; tactics?: { lineup: { player: Named; jersey_number: number }[] };
  [detail: string]: unknown;
};

const slug = (n: string) => n.trim().toLowerCase().replace(/[\s-]+/g, "_");
// Outcomes StatsBomb records in more detail than our spec, folded into the spec's values.
const OUTCOME_ALIASES: Record<string, Record<string, string>> = {
  pass: { pass_offside: "incomplete", unknown: "incomplete", injury_clearance: "incomplete" },
  shot: { wayward: "off_t", saved_to_post: "saved", saved_off_target: "saved" },
  tackle: { success_in_play: "won", success_out: "won", success: "won", lost_out: "lost_in_play", lost: "lost_in_play" },
  interception: { success_in_play: "won", success_out: "won", success: "won", lost_out: "lost_in_play", lost: "lost_in_play" },
  goalkeeper: { punched_out: "success", saved_twice: "success", collected_twice: "success", won: "success", clear: "success",
    touched_out: "in_play_safe", no_touch: "fail", touched_in: "fail" },
};
const SB_TYPES: Record<string, string> = {
  Pass: "pass", Carry: "carry", Shot: "shot", Dribble: "dribble", "Ball Recovery": "ball_recovery", Interception: "interception",
  Clearance: "clearance", Block: "block", Pressure: "pressure", "Ball Receipt*": "ball_receipt", Miscontrol: "miscontrol",
  Dispossessed: "dispossessed", "Dribbled Past": "dribbled_past", "Foul Committed": "foul_committed", "Foul Won": "foul_won",
  "Goal Keeper": "goalkeeper",
};
const SB_KEY: Record<string, string> = { ball_recovery: "ball_recovery", ball_receipt: "ball_receipt", foul_committed: "foul_committed", goalkeeper: "goalkeeper" };

export function importStatsBomb(json: unknown, ctx: MatchContext): ImportResult {
  if (!Array.isArray(json)) return { events: [], errors: [{ row: 0, message: "expected a JSON array of events" }], skipped: 0 };
  const events = json as SbEvent[];
  const jersey = new Map<string, number>();
  for (const e of events) {
    if (e.type?.name === "Starting XI") for (const l of e.tactics?.lineup ?? []) jersey.set(`${e.team.name}|${l.player.name}`, l.jersey_number);
  }
  const errors: ImportError[] = [];
  const rows: { row: number; event: ImportedEvent }[] = [];
  let skipped = 0;
  events.forEach((e, i) => {
    const row = i + 1;
    const fail = (message: string) => errors.push({ row, message });
    const isDuel = e.type?.name === "Duel";
    const detail = (isDuel ? e.duel : e[SB_KEY[SB_TYPES[e.type?.name]] ?? slug(e.type?.name ?? "")]) as Record<string, unknown> | undefined;
    const duelType = (detail?.type as Named | undefined)?.name;
    const type = isDuel ? (duelType === "Tackle" ? "tackle" : duelType === "Aerial Lost" ? "duel" : null) : SB_TYPES[e.type?.name];
    if (!type) { skipped++; return; }
    if (!e.player) return fail(`${e.type.name} without a player`);
    const team_id = teamOf(ctx, e.team?.name ?? "");
    if (!team_id) return fail(`team "${e.team?.name}" is neither ${ctx.home.name} nor ${ctx.away.name}`);
    const name = e.player.name.toLowerCase();
    const shirt = jersey.get(`${e.team.name}|${e.player.name}`);
    const player = ctx.players.find((p) => p.team_id === team_id && p.display_name.toLowerCase() === name)
      ?? ctx.players.find((p) => p.team_id === team_id && shirt != null && p.shirt_number === shirt);
    if (!player) return fail(`"${e.player.name}" is not on the match sheet for ${e.team.name}`);
    const d = detail ?? {};
    const rawOutcome = (d.outcome as Named | undefined)?.name;
    let outcome: string | null = rawOutcome ? slug(rawOutcome) : null;
    if (outcome && OUTCOME_ALIASES[type]?.[outcome]) outcome = OUTCOME_ALIASES[type][outcome];
    if (!outcome && ["pass", "ball_receipt"].includes(type)) outcome = "complete";
    if (type === "duel") outcome = "lost";
    const extra: Record<string, unknown> = {};
    if (e.under_pressure && SPEC_BY_TYPE[type].flags.some((f) => f.key === "under_pressure")) extra.under_pressure = true;
    for (const f of ["cross", "through_ball", "shot_assist", "goal_assist", "first_time", "aerial_won"]) if (d[f]) extra[f] = true;
    if ((d.technique as Named | undefined)?.name === "Through Ball") extra.through_ball = true;
    const setPiece = (d.type as Named | undefined)?.name;
    if ((type === "pass" || type === "shot") && setPiece && setPiece !== "Open Play" && setPiece !== "Recovery" && setPiece !== "Interception") extra.set_piece = slug(setPiece);
    if (d.card) extra.card = slug((d.card as Named).name);
    if (type === "goalkeeper" && setPiece) extra.gk_type = slug(setPiece);
    const end = d.end_location as number[] | undefined;
    const spec = SPEC_BY_TYPE[type];
    rows.push({
      row,
      event: {
        ...normalise({
          type, outcome, x: e.location?.[0] ?? null, y: e.location?.[1] ?? null,
          end_x: spec.end === "required" ? end?.[0] ?? null : null, end_y: spec.end === "required" ? end?.[1] ?? null : null,
          body_part: spec.bodyPart ? ((d.body_part as Named | undefined)?.name ?? null) : null, extra,
        }),
        player_id: player.player_id, team_id, period: e.period, video_seconds: e.minute * 60 + e.second,
      },
    });
  });
  return finish(rows, errors, skipped);
}
