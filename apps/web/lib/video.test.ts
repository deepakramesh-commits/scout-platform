import assert from "node:assert/strict";
import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendChunk, finishUpload, muxPlaybackToken, receivedBytes, verifyMuxSignature } from "./video.ts";

test("a dropped upload resumes from the bytes the server holds, and a resent chunk is not written twice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "scout-video-"));
  assert.equal(await receivedBytes(dir, "m"), 0);
  assert.deepEqual(await appendChunk(dir, "m", 0, new Uint8Array([1, 2, 3])), { ok: true, received: 3 });
  assert.deepEqual(await appendChunk(dir, "m", 0, new Uint8Array([1, 2, 3])), { ok: false, received: 3 });
  assert.deepEqual(await appendChunk(dir, "m", 3, new Uint8Array([4, 5])), { ok: true, received: 5 });
  assert.equal(await finishUpload(dir, "m", 6, ".mp4"), null);
  assert.equal(await finishUpload(dir, "m", 5, ".exe"), null);
  assert.equal(await finishUpload(dir, "m", 5, ".mp4"), "m.mp4");
  assert.deepEqual([...await readFile(join(dir, "m.mp4"))], [1, 2, 3, 4, 5]);
});

test("Mux webhook signatures are checked, including their age", () => {
  const body = '{"type":"video.asset.ready"}';
  const now = 1_800_000_000_000;
  const t = String(now / 1000);
  const v1 = createHmac("sha256", "secret").update(`${t}.${body}`).digest("hex");
  assert.equal(verifyMuxSignature(body, `t=${t},v1=${v1}`, "secret", now), true);
  assert.equal(verifyMuxSignature(body + " ", `t=${t},v1=${v1}`, "secret", now), false);
  assert.equal(verifyMuxSignature(body, `t=${t},v1=${v1}`, "other", now), false);
  assert.equal(verifyMuxSignature(body, `t=${t},v1=${v1}`, "secret", now + 3600_000), false);
  assert.equal(verifyMuxSignature(body, null, "secret", now), false);
});

test("playback tokens are RS256 JWTs for the playback id, verifiable with the public key", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const token = muxPlaybackToken("abc", "kid1", privateKey.export({ type: "pkcs8", format: "pem" }).toString(), 1_800_000_000_000);
  const [h, b, s] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "RS256", typ: "JWT", kid: "kid1" });
  assert.deepEqual(JSON.parse(Buffer.from(b, "base64url").toString()), { sub: "abc", aud: "v", exp: 1_800_003_600 });
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(s, "base64url")));
});
