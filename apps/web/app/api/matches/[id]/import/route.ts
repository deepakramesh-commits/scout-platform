// All or nothing: a half-imported match would feed profiles silently.
import { randomUUID } from "node:crypto";
import { db } from "@/lib/auth";
import { apiUser, getMatch, json, matchPlayers } from "@/lib/engine";
import { importCsv, importStatsBomb, type ImportResult, type MatchContext } from "@/lib/import";

// A full match is a few MB of JSON; the whole file is held in memory while it is checked.
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const tooBig = () => json({ errors: [{ row: 0, message: "the file is over 20 MB; a full match is a few MB" }], imported: 0 }, 413);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(["tagger", "admin"]);
  if (user instanceof Response) return user;
  const { id } = await params;
  const filename = (new URL(req.url).searchParams.get("filename") ?? "upload").slice(0, 200);
  if (Number(req.headers.get("content-length")) > MAX_IMPORT_BYTES) return tooBig();
  const text = await req.text();
  if (text.length > MAX_IMPORT_BYTES) return tooBig();
  const format = /\.json$/i.test(filename) || /^\s*\[/.test(text) ? "statsbomb_json" : "csv";

  return db(async (tx) => {
    const match = await getMatch(tx, id);
    if (!match) return json({ error: "No such match." }, 404);
    const [{ ok }] = await tx<{ ok: boolean }[]>`select app.assigned(${id}, 'analyst') as ok`;
    if (!ok) return json({ error: "You are not the analyst for this match." }, 403);
    if (match.status === "published") return json({ error: "This match is published; its events can no longer change." }, 409);
    const players = (await matchPlayers(tx, match)).filter((p) => p.on_sheet);
    if (!players.length) return json({ errors: [{ row: 0, message: "Fill the match sheet first: players are found by team and shirt number on it." }], imported: 0 }, 422);
    const ctx: MatchContext = { home: { id: match.home_id, name: match.home }, away: { id: match.away_id, name: match.away }, players };

    let result: ImportResult;
    if (format === "csv") result = importCsv(text, ctx);
    else {
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch (e) { return json({ errors: [{ row: 0, message: `not valid JSON: ${(e as Error).message}` }], imported: 0 }, 422); }
      result = importStatsBomb(parsed, ctx);
    }
    if (result.errors.length) return json({ errors: result.errors, imported: 0, format }, 422);
    if (!result.events.length) return json({ errors: [{ row: 0, message: "the file holds no events" }], imported: 0, format }, 422);

    const rows = result.events.map((e) => ({
      id: randomUUID(), match_id: id, player_id: e.player_id, team_id: e.team_id, period: e.period, video_seconds: e.video_seconds,
      type: e.type, outcome: e.outcome, x: e.x, y: e.y, end_x: e.end_x, end_y: e.end_y, body_part: e.body_part,
      extra: tx.json(e.extra as Parameters<typeof tx.json>[0]), source: "import", tagger_id: user.id,
    }));
    // Postgres takes at most 65,535 parameters a statement; a full match is a few thousand events.
    for (let i = 0; i < rows.length; i += 1000) await tx`insert into events ${tx(rows.slice(i, i + 1000))}`;
    const [row] = await tx<{ id: string }[]>`
      insert into imports (match_id, format, filename, rows_imported, created_by) values (${id}, ${format}, ${filename}, ${result.events.length}, ${user.id}) returning id`;
    if (match.status === "uploaded") await tx`select app.advance_match(${id}, 'tagging')`;
    return json({ ok: true, imported: result.events.length, skipped: result.skipped, format, import_id: row.id });
  });
}
