"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { HStack } from "@astryxdesign/core/HStack";
import { ID_DOCUMENT_MAX_BYTES } from "@/lib/workflow";

export function IdUpload({ playerId }: { playerId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ type: "error" | "success"; message: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    if (!file) return setStatus({ type: "error", message: "Choose a file first." });
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(`/verify/id-document?player=${playerId}`, { method: "POST", body }).catch(() => null);
    const out: unknown = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok) { setFile(null); setStatus({ type: "success", message: "Uploaded to private storage." }); router.refresh(); return; }
    const error = typeof out === "object" && out !== null && "error" in out && typeof out.error === "string" ? out.error : "The upload failed. Try again.";
    setStatus({ type: "error", message: error });
  };
  return (
    <HStack gap={2} vAlign="end" wrap="wrap">
      <FileInput label="ID document" description="PDF, JPEG or PNG, up to 5 MB. Stored privately; only our admins can open it."
        value={file} onChange={(f) => { setStatus(undefined); setFile(f instanceof File ? f : null); }}
        accept="application/pdf,image/jpeg,image/png" maxSize={ID_DOCUMENT_MAX_BYTES} status={status} width={320} />
      <Button label="Upload" variant="secondary" isLoading={busy} onClick={upload} />
    </HStack>
  );
}
