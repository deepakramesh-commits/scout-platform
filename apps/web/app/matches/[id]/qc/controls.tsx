"use client";

import { useState, useTransition } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { publish, requestExport, runCheck, saveSample, type ActionResult } from "./actions";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const seconds = (mmss: string) => {
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(mmss.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (f: () => Promise<ActionResult>) => start(async () => setResult(await f()));
  const banner = result && (result.ok
    ? <Banner status="success" title={result.message} onDismiss={() => setResult(null)} />
    : <Banner status="error" title={result.error} onDismiss={() => setResult(null)} />);
  return { pending, run, banner };
}

export function SampleForm({ matchId, initial, periods }: {
  matchId: string; initial: { period: number; start: number; minutes: number }; periods: number[];
}) {
  const [period, setPeriod] = useState(String(initial.period));
  const [start, setStart] = useState(clock(initial.start));
  const [minutes, setMinutes] = useState(initial.minutes);
  const { pending, run, banner } = useAction();
  const startSeconds = seconds(start);
  return (
    <VStack gap={3}>
      <HStack gap={2} wrap="wrap" vAlign="end">
        <Selector label="Period" size="sm" value={period} onChange={setPeriod}
          options={(periods.length ? periods : [1, 2]).map((p) => ({ value: String(p), label: `Period ${p}` }))} />
        <TextInput label="Starts at (video mm:ss)" size="sm" value={start} onChange={setStart}
          status={startSeconds == null ? { type: "error", message: "Write the time as mm:ss" } : undefined} />
        <NumberInput label="Minutes" size="sm" min={1} max={60} value={minutes} onChange={setMinutes} />
        <Button label="Save sample" isLoading={pending} isDisabled={startSeconds == null}
          onClick={() => run(() => saveSample(matchId, { period: Number(period), start: startSeconds!, minutes }))} />
      </HStack>
      {banner}
    </VStack>
  );
}

export function ActionButton({ label, kind, matchId, variant = "secondary", isDisabled, why }: {
  label: string; kind: "run" | "publish" | "export"; matchId: string; variant?: "primary" | "secondary"; isDisabled?: boolean; why?: string;
}) {
  const { pending, run, banner } = useAction();
  const f = { run: runCheck, publish, export: requestExport }[kind];
  return (
    <VStack gap={2}>
      <Button label={label} variant={variant} isLoading={pending} isDisabled={isDisabled} tooltip={isDisabled ? why : undefined} onClick={() => run(() => f(matchId))} />
      {banner}
    </VStack>
  );
}
