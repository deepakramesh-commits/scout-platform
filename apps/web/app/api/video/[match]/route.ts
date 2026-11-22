// Streams a match video stored locally, with Range support so the browser's player can seek.
// Access is row-level security: a user who cannot see the match gets a 404, not the file.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { Readable } from "node:stream";
import { currentUserId, db } from "@/lib/auth";
import { parseRange } from "@/lib/http-range";
import { VIDEO_TYPES, videoDir } from "@/lib/video";

export async function GET(req: Request, { params }: { params: Promise<{ match: string }> }) {
  if (!(await currentUserId())) return new Response("Sign in to watch match video.", { status: 401 });
  const { match } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(match)) return new Response("Not found", { status: 404 });
  const [row] = await db((tx) => tx<{ video_path: string | null }[]>`
    select video_path from matches where id = ${match} and video_provider = 'local'`);
  if (!row?.video_path) return new Response("Not found", { status: 404 });
  const file = join(videoDir(), row.video_path);
  const size = await stat(file).then((s) => s.size, () => null);
  if (size == null) return new Response("The video file is missing from storage.", { status: 404 });
  const headers = { "Content-Type": VIDEO_TYPES[extname(file)] ?? "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  const range = parseRange(req.headers.get("range"), size);
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: { ...headers, "Content-Length": String(end - start + 1), ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) },
  });
}
