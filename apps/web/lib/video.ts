// Match video behind one small interface: local files by default, Mux when its keys are in the environment.
// Uploads resume after a dropped connection: the client asks how many bytes the server holds and sends the rest.
import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export type Provider = "local" | "mux";
export const provider = (): Provider => (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET ? "mux" : "local");
export const CLIP_BEFORE = 5;
export const CLIP_AFTER = 8;
export const VIDEO_TYPES: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };

export const videoDir = () => join(resolve(process.env.STORAGE_DIR ?? join(process.cwd(), "../../storage")), "videos");
const partPath = (dir: string, matchId: string) => join(dir, `${matchId}.part`);

/** Bytes already received for an upload in progress (0 when none). */
export async function receivedBytes(dir: string, matchId: string): Promise<number> {
  return stat(partPath(dir, matchId)).then((s) => s.size, () => 0);
}

export type ChunkResult = { ok: true; received: number } | { ok: false; received: number };

/** Appends a chunk only when it starts where the file ends, so a resent chunk is never written twice. */
export async function appendChunk(dir: string, matchId: string, offset: number, bytes: Uint8Array): Promise<ChunkResult> {
  await mkdir(dir, { recursive: true });
  const have = await receivedBytes(dir, matchId);
  if (offset !== have) return { ok: false, received: have };
  await appendFile(partPath(dir, matchId), bytes);
  return { ok: true, received: have + bytes.length };
}

/** Closes an upload once every byte is in; returns the stored file name. */
export async function finishUpload(dir: string, matchId: string, total: number, ext: string): Promise<string | null> {
  if ((await receivedBytes(dir, matchId)) !== total || !VIDEO_TYPES[ext]) return null;
  const name = `${matchId}${ext}`;
  await rename(partPath(dir, matchId), join(dir, name));
  return name;
}

// ---------- Mux ----------

const muxAuth = () => `Basic ${Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64")}`;

/** A Mux direct upload URL; the browser sends the file straight to Mux in chunks. */
export async function createMuxUpload(matchId: string, origin: string): Promise<{ id: string; url: string }> {
  const res = await fetch("https://api.mux.com/video/v1/uploads", {
    method: "POST",
    headers: { Authorization: muxAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({ cors_origin: origin, new_asset_settings: { playback_policy: ["signed"], passthrough: matchId } }),
  });
  if (!res.ok) throw new Error(`Mux upload failed: ${res.status} ${await res.text()}`);
  const { data } = (await res.json()) as { data: { id: string; url: string } };
  return { id: data.id, url: data.url };
}

/** Mux signs `${t}.${body}` with the webhook secret; reject stale or forged calls. */
export function verifyMuxSignature(body: string, header: string | null, secret: string, now = Date.now(), toleranceSeconds = 300): boolean {
  const parts = Object.fromEntries((header ?? "").split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${parts.t}.${body}`).digest("hex"));
  const got = Buffer.from(parts.v1);
  return want.length === got.length && timingSafeEqual(want, got);
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** A signed playback token (RS256 JWT) so match footage cannot be shared outside the app. */
export function muxPlaybackToken(playbackId: string, keyId: string, privateKeyPem: string, now = Date.now(), ttlSeconds = 3600): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: keyId }));
  const body = b64url(JSON.stringify({ sub: playbackId, aud: "v", exp: Math.floor(now / 1000) + ttlSeconds }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKeyPem).toString("base64url");
  return `${head}.${body}.${sig}`;
}

/** Mux hands out the private key base64-encoded. */
export const muxPrivateKey = () => Buffer.from(process.env.MUX_SIGNING_KEY_PRIVATE ?? "", "base64").toString("utf8");

/** Where the player streams a match from. Local files are served by /api/video/[match], which checks access. */
export function playbackUrl(match: { id: string; video_provider: string | null; mux_playback_id: string | null }): string | null {
  if (match.video_provider === "mux" && match.mux_playback_id && process.env.MUX_SIGNING_KEY_ID) {
    const token = muxPlaybackToken(match.mux_playback_id, process.env.MUX_SIGNING_KEY_ID, muxPrivateKey());
    return `https://stream.mux.com/${match.mux_playback_id}.m3u8?token=${token}`;
  }
  return match.video_provider === "local" ? `/api/video/${match.id}` : null;
}
