// Resumable local upload. HEAD answers how many bytes are already here; PUT appends a chunk at its offset (a resent
// chunk is never written twice); POST closes the upload and records the file on the match; DELETE drops a partial one.
import { rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { db } from "@/lib/auth";
import { apiUser, json } from "@/lib/engine";
import { appendChunk, CHUNK_BYTES, finishUpload, receivedBytes, VIDEO_TYPES, videoDir } from "@/lib/video";

type Ctx = { params: Promise<{ match: string }> };

/** The coordinator of this match (or an admin) may upload; anyone else gets a status, never a redirect. */
async function allowed({ params }: Ctx): Promise<{ match: string; userId: string } | Response> {
  const user = await apiUser(["coordinator", "admin"]);
  if (user instanceof Response) return user;
  const { match } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(match)) return json({ error: "No such match." }, 404);
  const [row] = await db((tx) => tx<{ ok: boolean }[]>`select app.assigned(id, 'coordinator') as ok from matches where id = ${match}`);
  if (!row) return json({ error: "No such match." }, 404);
  if (!row.ok) return json({ error: "You are not the coordinator for this match." }, 403);
  return { match, userId: user.id };
}

export async function HEAD(_: Request, ctx: Ctx) {
  const a = await allowed(ctx);
  if (a instanceof Response) return new Response(null, { status: a.status });
  return new Response(null, { headers: { "Upload-Offset": String(await receivedBytes(videoDir(), a.match)), "Chunk-Bytes": String(CHUNK_BYTES) } });
}

export async function PUT(req: Request, ctx: Ctx) {
  const a = await allowed(ctx);
  if (a instanceof Response) return a;
  const offset = Number(new URL(req.url).searchParams.get("offset"));
  if (!Number.isInteger(offset) || offset < 0) return json({ error: "offset must be a whole number of bytes" }, 400);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > CHUNK_BYTES) return json({ error: `a chunk is 1 to ${CHUNK_BYTES} bytes` }, 400);
  const r = await appendChunk(videoDir(), a.match, offset, bytes);
  return json({ received: r.received }, r.ok ? 200 : 409);
}

export async function POST(req: Request, ctx: Ctx) {
  const a = await allowed(ctx);
  if (a instanceof Response) return a;
  const body = (await req.json().catch(() => null)) as { total?: unknown; name?: unknown } | null;
  const total = body?.total;
  const ext = typeof body?.name === "string" ? extname(body.name).toLowerCase() : "";
  if (typeof total !== "number" || !Number.isInteger(total) || total <= 0) return json({ error: "total must be the file size in bytes" }, 400);
  if (!VIDEO_TYPES[ext]) return json({ error: `the video must be ${Object.keys(VIDEO_TYPES).join(", ")}` }, 400);
  const name = await finishUpload(videoDir(), a.match, total, ext);
  if (!name) return json({ error: "Not every byte has arrived yet.", received: await receivedBytes(videoDir(), a.match) }, 409);
  const [old] = await db((tx) => tx<{ video_path: string | null }[]>`
    with prev as (select video_path from matches where id = ${a.match})
    update matches set video_provider = 'local', video_path = ${name}, video_size = ${total}, video_status = 'ready'
    where id = ${a.match} returning (select video_path from prev)`);
  // A replaced video with another extension would otherwise stay on disk forever.
  if (old?.video_path && old.video_path !== name) await rm(join(videoDir(), old.video_path), { force: true });
  return json({ ok: true, video_path: name });
}

export async function DELETE(_: Request, ctx: Ctx) {
  const a = await allowed(ctx);
  if (a instanceof Response) return a;
  await rm(join(videoDir(), `${a.match}.part`), { force: true });
  return json({ ok: true });
}
