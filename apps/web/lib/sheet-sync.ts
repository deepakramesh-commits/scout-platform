// The match sheet between the phone and the server: ids made on the phone, the sheet rebuilt from stored rows,
// and the body the phone sends checked before it is written. Pure: relative .ts imports only.
import { KINDS, POSITIONS, type Kind, type Position, type Sheet, type SheetEntry, type SheetLine } from "./match-sheet.ts";
import { isUuid, type Parsed } from "./log-tool.ts";

/** A v4 uuid. crypto.randomUUID exists only on https or localhost; a club phone on the local network has neither. */
export function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type LineupRow = SheetLine & { minutes_played: number };
export type SheetEventRow = { id: string; kind: Kind; minute: number; player_id: string; player_in_id: string | null };

/** One team's sheet as stored. Extra time is not stored: a player who stayed on played the full length, so > 90 means 120. */
export function sheetFromRows(lineups: LineupRow[], events: SheetEventRow[]): Sheet {
  return {
    lineup: lineups.map(({ player_id, shirt_number, position, started }) => ({ player_id, shirt_number, position, started })),
    entries: events.map(({ id, kind, minute, player_id, player_in_id }) => ({ id, kind, minute, player_id, player_in_id })),
    length: lineups.some((l) => l.minutes_played > 90) ? 120 : 90,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const intOrNull = (v: unknown) => (v == null ? null : Number.isInteger(v) ? (v as number) : undefined);

/** What the phone sends for one team, shaped into a Sheet; validateSheet then checks it against the squad. */
export function parseSheetBody(body: unknown): Parsed<{ team_id: string; sheet: Sheet }> {
  if (!isRecord(body) || !isUuid(body.team_id) || !isRecord(body.sheet)) return { ok: false, errors: ["expected a team id and its sheet"] };
  const { lineup, entries, length } = body.sheet;
  if (!Array.isArray(lineup) || !Array.isArray(entries) || (length !== 90 && length !== 120)) return { ok: false, errors: ["the sheet is malformed"] };
  const lines: SheetLine[] = [];
  for (const l of lineup) {
    const shirt = isRecord(l) ? intOrNull(l.shirt_number) : undefined;
    if (!isRecord(l) || !isUuid(l.player_id) || shirt === undefined || typeof l.started !== "boolean"
        || !(l.position == null || POSITIONS.includes(l.position as Position))) return { ok: false, errors: ["a line-up row is malformed"] };
    lines.push({ player_id: l.player_id, shirt_number: shirt, position: (l.position as Position | null) ?? null, started: l.started });
  }
  const out: SheetEntry[] = [];
  for (const e of entries) {
    const minute = isRecord(e) ? intOrNull(e.minute) : undefined;
    if (!isRecord(e) || !isUuid(e.id) || !KINDS.includes(e.kind as Kind) || minute === undefined || !isUuid(e.player_id)
        || !(e.player_in_id == null || isUuid(e.player_in_id))) return { ok: false, errors: ["an entry is malformed"] };
    out.push({ id: e.id, kind: e.kind as Kind, minute, player_id: e.player_id, player_in_id: (e.player_in_id as string | null) ?? null });
  }
  return { ok: true, value: { team_id: body.team_id, sheet: { lineup: lines, entries: out, length } } };
}
