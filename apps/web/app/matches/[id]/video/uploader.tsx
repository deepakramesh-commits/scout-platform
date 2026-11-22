"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

type Phase =
  | { kind: "idle" }
  | { kind: "sending"; sent: number }
  | { kind: "waiting"; sent: number }
  | { kind: "done" }
  | { kind: "failed"; message: string };

const CHUNK = 8 * 1024 * 1024; // lib/video.ts CHUNK_BYTES; a multiple of 256 KiB, as Mux requires
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const backOnline = () => new Promise<void>((resolve) => {
  const done = () => { window.removeEventListener("online", done); resolve(); };
  window.addEventListener("online", done);
  setTimeout(done, navigator.onLine ? 3000 : 30000);
});

class Refused extends Error {}

async function check(res: Response): Promise<Response> {
  if (res.status === 401 || res.status === 403 || res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Refused(body.error ?? `refused (${res.status})`);
  }
  return res;
}

async function uploadLocal(matchId: string, file: File, progress: (p: Phase) => void) {
  const base = `/api/video/${matchId}/upload`;
  const fingerprint = `${file.name}|${file.size}|${file.lastModified}`;
  const key = `scout.upload.${matchId}`;
  let offset = Number((await check(await fetch(base, { method: "HEAD" }))).headers.get("Upload-Offset") ?? 0);
  // A partial upload of another file cannot be continued with this one.
  if (offset > 0 && localStorage.getItem(key) !== fingerprint) { await check(await fetch(base, { method: "DELETE" })); offset = 0; }
  try { localStorage.setItem(key, fingerprint); } catch { /* resuming after a reload then restarts from the server's count */ }
  while (offset < file.size) {
    progress({ kind: "sending", sent: offset });
    try {
      const res = await check(await fetch(`${base}?offset=${offset}`, { method: "PUT", body: file.slice(offset, offset + CHUNK) }));
      offset = ((await res.json()) as { received: number }).received;
    } catch (e) {
      if (e instanceof Refused) throw e;
      progress({ kind: "waiting", sent: offset });
      await backOnline();
      offset = Number((await fetch(base, { method: "HEAD" }).catch(() => null))?.headers.get("Upload-Offset") ?? offset);
    }
  }
  const res = await check(await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ total: file.size, name: file.name }) }));
  if (!res.ok) throw new Refused(((await res.json()) as { error?: string }).error ?? "the server did not accept the file");
  localStorage.removeItem(key);
}

/**
 * Mux direct upload: chunks with Content-Range; after a failure Mux answers an empty PUT with how much it holds.
 * shortcut: the upload URL lives only in this page, so closing the tab restarts the upload; persist it if clubs need that.
 */
async function uploadMux(matchId: string, file: File, progress: (p: Phase) => void) {
  const res = await check(await fetch(`/api/video/${matchId}/mux`, { method: "POST" }));
  const { url } = (await res.json()) as { url: string };
  let offset = 0;
  while (offset < file.size) {
    progress({ kind: "sending", sent: offset });
    const end = Math.min(offset + CHUNK, file.size);
    try {
      const r = await fetch(url, { method: "PUT", headers: { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` }, body: file.slice(offset, end) });
      if (r.status !== 308 && !r.ok) throw new Error(`Mux answered ${r.status}`);
      offset = end;
    } catch {
      progress({ kind: "waiting", sent: offset });
      await backOnline();
      const s = await fetch(url, { method: "PUT", headers: { "Content-Range": `bytes */${file.size}` } }).catch(() => null);
      const held = /bytes=0-(\d+)/.exec(s?.headers.get("Range") ?? "");
      offset = held ? Number(held[1]) + 1 : s?.ok ? file.size : 0;
    }
  }
}

export function Uploader({ matchId, mux }: { matchId: string; mux: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "sending" || phase.kind === "waiting";

  const start = async () => {
    if (!file) return;
    try {
      await (mux ? uploadMux : uploadLocal)(matchId, file, setPhase);
      setPhase({ kind: "done" });
      await pause(300);
      router.refresh();
    } catch (e) {
      setPhase({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <VStack gap={3}>
      <FileInput label="Match video" description="MP4, WebM or MOV. A dropped connection resumes where it stopped." accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
        value={file} onChange={(f) => { setFile(Array.isArray(f) ? f[0] ?? null : f); setPhase({ kind: "idle" }); }} isDisabled={busy} />
      {(phase.kind === "sending" || phase.kind === "waiting") && file && (
        <VStack gap={1}>
          <ProgressBar label="Uploaded" value={phase.sent} max={file.size} variant={phase.kind === "waiting" ? "warning" : "accent"} />
          <Text type="supporting">
            {mb(phase.sent)} of {mb(file.size)}{phase.kind === "waiting" ? " · connection lost, resuming when it returns" : ""}
          </Text>
        </VStack>
      )}
      {phase.kind === "done" && <Banner status="success" title="Upload complete" description={mux ? "Mux is processing the video; it plays here once ready." : "The video is stored and plays below."} />}
      {phase.kind === "failed" && <Banner status="error" title="Upload stopped" description={phase.message} />}
      <Button variant="primary" label={busy ? "Uploading…" : "Upload video"} onClick={start} isDisabled={!file || busy} isLoading={busy} />
      {!file && <Text type="supporting" color="secondary">Choose the match video first.</Text>}
    </VStack>
  );
}
