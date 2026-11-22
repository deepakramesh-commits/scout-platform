// Mux calls this when an uploaded match video is ready. No user is signed in, so it writes with the service
// connection, and only after the signature proves the call came from Mux.
import { serviceSql } from "@/lib/db";
import { verifyMuxSignature } from "@/lib/video";

type MuxEvent = { type?: string; data?: { id?: string; passthrough?: string; playback_ids?: { id: string }[] } };

export async function POST(req: Request) {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) return new Response("Mux webhooks are not configured.", { status: 503 });
  const body = await req.text();
  if (!verifyMuxSignature(body, req.headers.get("mux-signature"), secret)) return new Response("Bad signature.", { status: 401 });
  const event = JSON.parse(body) as MuxEvent;
  const match = event.data?.passthrough;
  if (!match || !/^[0-9a-f-]{36}$/i.test(match)) return new Response(null, { status: 204 });
  if (event.type === "video.asset.ready") {
    await serviceSql`update matches set mux_asset_id = ${event.data?.id ?? null}, mux_playback_id = ${event.data?.playback_ids?.[0]?.id ?? null},
                     video_status = 'ready' where id = ${match} and video_provider = 'mux'`;
  } else if (event.type === "video.asset.errored") {
    await serviceSql`update matches set video_status = 'failed' where id = ${match} and video_provider = 'mux'`;
  }
  return new Response(null, { status: 204 });
}
