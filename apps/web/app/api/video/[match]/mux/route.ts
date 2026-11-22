// The asset and playback ids arrive later through /api/mux/webhook.
import { db } from "@/lib/auth";
import { apiUser, json } from "@/lib/engine";
import { createMuxUpload, provider } from "@/lib/video";

export async function POST(req: Request, { params }: { params: Promise<{ match: string }> }) {
  const user = await apiUser(["coordinator", "admin"]);
  if (user instanceof Response) return user;
  if (provider() !== "mux") return json({ error: "Mux is not configured; use the local upload." }, 409);
  const { match } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(match)) return json({ error: "No such match." }, 404);
  const [row] = await db((tx) => tx<{ ok: boolean }[]>`select app.assigned(id, 'coordinator') as ok from matches where id = ${match}`);
  if (!row) return json({ error: "No such match." }, 404);
  if (!row.ok) return json({ error: "You are not the coordinator for this match." }, 403);
  const upload = await createMuxUpload(match, new URL(req.url).origin);
  await db((tx) => tx`update matches set video_provider = 'mux', mux_upload_id = ${upload.id}, video_status = 'uploading' where id = ${match}`);
  return json({ url: upload.url });
}
