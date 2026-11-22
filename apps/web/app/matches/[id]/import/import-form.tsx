"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { VStack } from "@astryxdesign/core/VStack";

type Outcome =
  | { kind: "ok"; imported: number; skipped: number }
  | { kind: "errors"; errors: { row: number; message: string }[] }
  | { kind: "failed"; message: string };

export function ImportForm({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const send = async () => {
    if (!file) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/import?filename=${encodeURIComponent(file.name)}`, { method: "POST", body: await file.text() });
      const body = (await res.json()) as { imported?: number; skipped?: number; errors?: { row: number; message: string }[]; error?: string };
      if (res.ok) { setOutcome({ kind: "ok", imported: body.imported ?? 0, skipped: body.skipped ?? 0 }); router.refresh(); }
      else if (body.errors) setOutcome({ kind: "errors", errors: body.errors });
      else setOutcome({ kind: "failed", message: body.error ?? `the server answered ${res.status}` });
    } catch {
      setOutcome({ kind: "failed", message: "No connection. Nothing was imported; try again when you are online." });
    }
    setBusy(false);
  };

  return (
    <VStack gap={3}>
      <FileInput label="Event file" description="A CSV in the layout below, or a StatsBomb-style JSON event file." accept=".csv,.json,text/csv,application/json"
        value={file} onChange={(f) => { setFile(Array.isArray(f) ? f[0] ?? null : f); setOutcome(null); }} isDisabled={busy} />
      <Button variant="primary" label="Import events" onClick={send} isDisabled={!file || busy} isLoading={busy} />
      {outcome?.kind === "ok" && (
        <Banner status="success" title={`Imported ${outcome.imported} events`}
          description={outcome.skipped ? `${outcome.skipped} rows of types outside the event spec (such as Starting XI) were skipped.` : "Every row was imported."} />
      )}
      {outcome?.kind === "failed" && <Banner status="error" title="Import failed" description={outcome.message} />}
      {outcome?.kind === "errors" && (
        <VStack gap={2}>
          <Banner status="error" title={`Nothing imported: ${outcome.errors.length} ${outcome.errors.length === 1 ? "problem" : "problems"}`}
            description="Fix every row below and import the whole file again. A match is never half imported." />
          <Table density="compact">
            <TableHeader><TableRow><TableHeaderCell>Row</TableHeaderCell><TableHeaderCell>Problem</TableHeaderCell></TableRow></TableHeader>
            <TableBody>
              {outcome.errors.slice(0, 500).map((e, i) => (
                <TableRow key={i}><TableCell>{e.row || "File"}</TableCell><TableCell>{e.message}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </VStack>
      )}
    </VStack>
  );
}
