// The match sheet a club coordinator fills on a phone: checks run as he types, and again on the server.
// Pure: no imports, so the same file runs in the browser, on the server, and under `node --test`.

export const POSITIONS = ["GK", "CB", "FB", "DM", "CM", "AM", "LW", "RW", "ST"] as const;
export type Position = (typeof POSITIONS)[number];
export const KINDS = ["substitution", "goal", "own_goal", "yellow_card", "red_card"] as const;
export type Kind = (typeof KINDS)[number];

export type SheetLine = { player_id: string; shirt_number: number | null; position: Position | null; started: boolean };
export type SheetEntry = { id: string; kind: Kind; minute: number | null; player_id: string; player_in_id: string | null };
export type Sheet = { lineup: SheetLine[]; entries: SheetEntry[]; length: 90 | 120 };
export type SquadPlayer = { player_id: string; shirt_number: number | null };
export type SheetError = { field: string; message: string };

const STARTERS = 11;
const MAX_SUBS: Record<Sheet["length"], number> = { 90: 5, 120: 6 };
const STOPPAGE = 15;

/** Who is on the pitch at the start of a minute, replaying substitutions and red cards in order. */
function onPitchAt(sheet: Sheet, minute: number, before?: SheetEntry): Set<string> {
  const on = new Set(sheet.lineup.filter((l) => l.started).map((l) => l.player_id));
  for (const e of ordered(sheet.entries)) {
    if (e === before || e.minute == null || e.minute > minute) break;
    if (e.kind === "substitution") { on.delete(e.player_id); if (e.player_in_id) on.add(e.player_in_id); }
    if (e.kind === "red_card") on.delete(e.player_id);
  }
  return on;
}

const ordered = (entries: SheetEntry[]) => [...entries].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

export function validateSheet(sheet: Sheet, squad: SquadPlayer[]): SheetError[] {
  const errors: SheetError[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });
  const inSquad = new Set(squad.map((s) => s.player_id));
  const named = new Set(sheet.lineup.map((l) => l.player_id));
  const starters = sheet.lineup.filter((l) => l.started);
  if (starters.length !== STARTERS) err("lineup", `pick ${STARTERS} starters (${starters.length} picked)`);
  if (starters.filter((l) => l.position === "GK").length !== 1 && starters.length) err("lineup", "exactly one starter must be the goalkeeper");
  const shirts = new Map<number, string>();
  sheet.lineup.forEach((l, i) => {
    if (!inSquad.has(l.player_id)) err(`lineup.${i}`, "this player is not in the squad list");
    if (l.shirt_number == null || !Number.isInteger(l.shirt_number) || l.shirt_number < 1 || l.shirt_number > 99) err(`lineup.${i}.shirt`, "shirt number must be 1 to 99");
    else if (shirts.has(l.shirt_number)) err(`lineup.${i}.shirt`, `shirt ${l.shirt_number} is already used`);
    else shirts.set(l.shirt_number, l.player_id);
    if (l.started && !l.position) err(`lineup.${i}.position`, "choose a position");
    if (l.position && !POSITIONS.includes(l.position)) err(`lineup.${i}.position`, "position is not one of the fixed choices");
  });
  if (new Set(sheet.lineup.map((l) => l.player_id)).size !== sheet.lineup.length) err("lineup", "a player is listed twice");

  const last = sheet.length + STOPPAGE;
  const subs = sheet.entries.filter((e) => e.kind === "substitution");
  if (subs.length > MAX_SUBS[sheet.length]) err("entries", `at most ${MAX_SUBS[sheet.length]} substitutions`);
  const cameOn = new Set<string>();
  const yellows = new Map<string, number>();
  for (const e of ordered(sheet.entries)) {
    const f = `entries.${sheet.entries.indexOf(e)}`;
    if (e.minute == null || !Number.isInteger(e.minute) || e.minute < 1 || e.minute > last) { err(`${f}.minute`, `minute must be 1 to ${last}`); continue; }
    if (!named.has(e.player_id)) { err(`${f}.player`, "pick a player from this team's sheet"); continue; }
    const on = onPitchAt(sheet, e.minute, e);
    if (e.kind === "substitution") {
      if (!e.player_in_id || !named.has(e.player_in_id)) err(`${f}.player_in`, "pick the substitute from the bench");
      else if (sheet.lineup.find((l) => l.player_id === e.player_in_id)?.started || cameOn.has(e.player_in_id)) err(`${f}.player_in`, "this player is already on the pitch");
      if (!on.has(e.player_id)) err(`${f}.player`, `he is not on the pitch in minute ${e.minute}`);
      if (e.player_in_id) cameOn.add(e.player_in_id);
    } else if (e.player_in_id) err(f, "only a substitution has a player coming on");
    if ((e.kind === "goal" || e.kind === "own_goal") && !on.has(e.player_id)) err(`${f}.player`, `he is not on the pitch in minute ${e.minute}`);
    if (e.kind === "yellow_card") {
      const n = (yellows.get(e.player_id) ?? 0) + 1;
      yellows.set(e.player_id, n);
      if (n > 2) err(`${f}`, "a third yellow card: the second already sent him off");
    }
  }
  return errors;
}

/** Minutes each named player was on the pitch. Two yellows count as a red at the second. */
export function minutesPlayed(sheet: Sheet): Record<string, number> {
  const end = sheet.length;
  const from = new Map<string, number>(sheet.lineup.filter((l) => l.started).map((l) => [l.player_id, 0]));
  const until = new Map<string, number>();
  const yellows = new Map<string, number>();
  for (const e of ordered(sheet.entries)) {
    const m = Math.min(e.minute ?? 0, end);
    if (e.kind === "substitution") { until.set(e.player_id, m); if (e.player_in_id) from.set(e.player_in_id, m); }
    if (e.kind === "red_card") until.set(e.player_id, m);
    if (e.kind === "yellow_card") {
      const n = (yellows.get(e.player_id) ?? 0) + 1;
      yellows.set(e.player_id, n);
      if (n === 2) until.set(e.player_id, m);
    }
  }
  return Object.fromEntries(sheet.lineup.map((l) => [l.player_id, from.has(l.player_id) ? Math.max(0, (until.get(l.player_id) ?? end) - from.get(l.player_id)!) : 0]));
}
