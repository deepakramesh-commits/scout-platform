// Each logged event saves on entry. The id comes from the analyst's browser, so a retried save updates the same row
// and a crash loses at most the action being entered. The assigned reviewer writes to review_events instead, inside
// the sample window, so a second opinion never feeds a profile.
import { db, type Q } from "@/lib/auth";
import { apiUser, getMatch, json, matchPlayers, type Match } from "@/lib/engine";
import { isUuid, parseEventInput } from "@/lib/log-tool";

type Table = "events" | "review_events";
const tableOf = (v: unknown): Table | null => (v === "events" ? "events" : v === "review" ? "review_events" : null);

/** The match, if this user may write this table on it now; otherwise the response to send. */
async function writable(tx: Q, id: string, table: Table): Promise<Match | Response> {
  const match = await getMatch(tx, id);
  if (!match) return json({ error: "No such match." }, 404);
  if (match.status === "published") return json({ error: "This match is published; its events can no longer change." }, 409);
  const task = table === "events" ? "analyst" : "reviewer";
  const [{ ok }] = await tx<{ ok: boolean }[]>`select app.assigned(${id}, ${task}) as ok`;
  return ok ? match : json({ error: `You are not the ${task} for this match.` }, 403);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(["tagger", "admin"]);
  if (user instanceof Response) return user;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const table = tableOf(body?.table);
  if (!table) return json({ errors: ["table must be events or review"] }, 400);
  const parsed = parseEventInput(body);
  if (!parsed.ok) return json({ errors: parsed.errors }, 422);
  const e = parsed.value;

  return db(async (tx) => {
    const match = await writable(tx, id, table);
    if (match instanceof Response) return match;
    if (e.team_id !== match.home_id && e.team_id !== match.away_id) return json({ errors: ["that team is not in this match"] }, 422);
    const players = await matchPlayers(tx, match);
    if (!players.some((p) => p.player_id === e.player_id && p.team_id === e.team_id)) return json({ errors: ["that player is not in this team for this match"] }, 422);
    if (table === "review_events") {
      const [s] = await tx<{ period: number; start: number; end: number }[]>`
        select period, start_seconds::float8 as start, end_seconds::float8 as end from qc_samples where match_id = ${id}`;
      if (!s) return json({ errors: ["no sample window is chosen yet; choose it on the quality check page"] }, 422);
      if (e.video_seconds < s.start || e.video_seconds > s.end) return json({ errors: ["this moment is outside the sample window"] }, 422);
    }
    const row = {
      id: e.id, match_id: id, player_id: e.player_id, team_id: e.team_id, period: e.period, video_seconds: e.video_seconds,
      type: e.type, outcome: e.outcome, x: e.x, y: e.y, end_x: e.end_x, end_y: e.end_y, body_part: e.body_part,
      extra: tx.json(e.extra as Parameters<typeof tx.json>[0]), source: "manual", tagger_id: user.id,
    };
    const saved = await tx`
      insert into ${tx(table)} ${tx(row)}
      on conflict (id) do update set player_id = excluded.player_id, team_id = excluded.team_id, period = excluded.period,
        video_seconds = excluded.video_seconds, type = excluded.type, outcome = excluded.outcome, x = excluded.x, y = excluded.y,
        end_x = excluded.end_x, end_y = excluded.end_y, body_part = excluded.body_part, extra = excluded.extra
      where ${tx(table)}.match_id = excluded.match_id
      returning id`;
    if (!saved.length) return json({ errors: ["that event id belongs to another match"] }, 409);
    if (table === "events" && match.status === "uploaded") await tx`select app.advance_match(${id}, 'tagging')`;
    return json({ ok: true, id: e.id });
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(["tagger", "admin"]);
  if (user instanceof Response) return user;
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const table = tableOf(q.get("table"));
  const eventId = q.get("event");
  if (!table || !isUuid(eventId)) return json({ errors: ["table and event are required"] }, 400);
  return db(async (tx) => {
    const match = await writable(tx, id, table);
    if (match instanceof Response) return match;
    // Deleting twice is fine: a retried delete after a dropped connection finds nothing and still succeeds.
    await tx`delete from ${tx(table)} where id = ${eventId} and match_id = ${id}`;
    return json({ ok: true });
  });
}
