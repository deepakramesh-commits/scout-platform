// The event log tool's rules, shared by the browser tool and the route that saves each event.
// Pure: relative .ts imports only, so `node --test` runs it.
import { checkEvent, normalise, type LoggedEvent } from "./event-spec.ts";
import type { Period } from "./qc.ts";

export type EventInput = LoggedEvent & { id: string; player_id: string; team_id: string; period: number; video_seconds: number };
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOrNull = (v: unknown): number | null | undefined => (v == null ? null : typeof v === "number" && Number.isFinite(v) ? v : undefined);
const strOrNull = (v: unknown): string | null | undefined => (v == null || v === "" ? null : typeof v === "string" ? v : undefined);

/** The period a moment of video belongs to: the latest marked period already started; period 1 before any is marked. */
export function periodAt(periods: Period[], t: number): number {
  const started = periods.filter((p) => p.start <= t).sort((a, b) => b.start - a.start);
  return started[0]?.period ?? 1;
}

/** A stored event back in the form the analyst entered it: an aerial duel's flag becomes its outcome again. */
export function denormalise(e: LoggedEvent): LoggedEvent {
  if (e.type !== "duel") return e;
  const { duel_type: _t, aerial_won, ...extra } = e.extra;
  return { ...e, outcome: aerial_won ? "won" : "lost", extra };
}

/** A saved event from the browser, checked against the event spec and stored the way the exporter expects. */
export function parseEventInput(body: unknown): Parsed<EventInput> {
  if (!isRecord(body)) return { ok: false, errors: ["expected an event object"] };
  const errors: string[] = [];
  if (!isUuid(body.id)) errors.push("id must be a uuid made on the client");
  if (!isUuid(body.player_id)) errors.push("pick a player");
  if (!isUuid(body.team_id)) errors.push("pick a team");
  const period = body.period;
  if (typeof period !== "number" || ![1, 2, 3, 4].includes(period)) errors.push("period must be 1 to 4");
  const t = body.video_seconds;
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0) errors.push("video time must be zero or more seconds");
  const [x, y, end_x, end_y] = [body.x, body.y, body.end_x, body.end_y].map(numOrNull);
  const outcome = strOrNull(body.outcome);
  const body_part = strOrNull(body.body_part);
  if ([x, y, end_x, end_y].includes(undefined)) errors.push("locations must be numbers");
  if (typeof body.type !== "string" || outcome === undefined || body_part === undefined || !isRecord(body.extra)) errors.push("type, outcome, body part or extra is malformed");
  if (errors.length) return { ok: false, errors };
  const event: LoggedEvent = {
    type: body.type as string, outcome: outcome ?? null, x: x ?? null, y: y ?? null, end_x: end_x ?? null, end_y: end_y ?? null,
    body_part: body_part ?? null, extra: body.extra as Record<string, unknown>,
  };
  const problems = checkEvent(event);
  if (problems.length) return { ok: false, errors: problems };
  return {
    ok: true,
    value: { ...normalise(event), id: body.id as string, player_id: body.player_id as string, team_id: body.team_id as string, period: period as number, video_seconds: t as number },
  };
}

/** Period marks from the browser: each period once, start before end, in playing order without overlap. */
export function parsePeriods(body: unknown): Parsed<Period[]> {
  if (!Array.isArray(body)) return { ok: false, errors: ["expected a list of periods"] };
  const errors: string[] = [];
  const periods: Period[] = [];
  for (const p of body) {
    if (!isRecord(p) || ![1, 2, 3, 4].includes(p.period as number) || typeof p.start !== "number" || typeof p.end !== "number"
        || !Number.isFinite(p.start) || !Number.isFinite(p.end) || p.start < 0) {
      errors.push("each period needs a number 1 to 4 and a start and end in seconds");
      continue;
    }
    if (p.end <= p.start) errors.push(`period ${p.period} must end after it starts`);
    periods.push({ period: p.period as number, start: p.start, end: p.end });
  }
  periods.sort((a, b) => a.period - b.period);
  periods.forEach((p, i) => {
    if (i && p.period === periods[i - 1].period) errors.push(`period ${p.period} is marked twice`);
    else if (i && p.start < periods[i - 1].end) errors.push(`period ${p.period} starts before period ${periods[i - 1].period} ends`);
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: periods };
}
