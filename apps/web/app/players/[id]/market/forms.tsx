"use client";

import Form from "next/form";
import { useActionState, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { AVAILABILITY, AVAILABILITY_LABEL, HEIGHT_MAX, HEIGHT_MIN, TEST_RANGE, type MarketInput } from "@/lib/market-form";
import { addTest, saveMarket } from "./actions";

const error = (message: string | undefined) => (message ? { type: "error" as const, message } : undefined);
const FEET = [{ value: "right", label: "Right" }, { value: "left", label: "Left" }, { value: "both", label: "Both" }];
const isISODate = (s: string | null | undefined): s is ISODateString => s != null && /^\d{4}-\d{2}-\d{2}$/.test(s);
const iso = (s: string | null | undefined) => (isISODate(s) ? s : undefined);

function Errors({ title, errors }: { title: string; errors: Record<string, string | undefined> }) {
  const all = Object.values(errors).filter(Boolean);
  return all.length ? <Banner status="error" title={title} description={all.join(" ")} collapsible={false} /> : null;
}

export function MarketForm({ playerId, initial, canPlayer, canMarket }: { playerId: string; initial: MarketInput; canPlayer: boolean; canMarket: boolean }) {
  const [state, action, pending] = useActionState(saveMarket, null);
  const [v, setV] = useState(initial);
  const set = <K extends keyof MarketInput>(k: K) => (x: MarketInput[K] | undefined) => setV((s) => ({ ...s, [k]: x ?? null }));
  const errors = state?.errors ?? {};
  return (
    <Form action={action} noValidate>
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="contractEnd" value={v.contractEnd ?? ""} />
      <VStack gap={4}>
        <Errors title="Market details were not saved" errors={errors} />
        {canPlayer && (
          <Grid columns={{ minWidth: 200, repeat: "fill" }} gap={4}>
            <NumberInput label="Height (cm)" htmlName="heightCm" value={v.heightCm} onChange={(x: number | null) => set("heightCm")(x)}
              min={HEIGHT_MIN} max={HEIGHT_MAX} isIntegerOnly hasClear isOptional status={error(errors.heightCm)} />
            <Selector label="Preferred foot" htmlName="preferredFoot" options={FEET} value={v.preferredFoot}
              onChange={(x: string | null) => set("preferredFoot")(x as MarketInput["preferredFoot"])} hasClear isOptional placeholder="Not recorded"
              presentation="adaptive" status={error(errors.preferredFoot)} />
          </Grid>
        )}
        {canMarket && (
          <>
            <Grid columns={{ minWidth: 200, repeat: "fill" }} gap={4}>
              <DateInput label="Contract ends" value={iso(v.contractEnd)} onChange={(x) => set("contractEnd")(x ?? null)} hasClear isOptional
                status={error(errors.contractEnd)} />
              <Selector label="Availability" htmlName="availability" value={v.availability} hasClear isOptional placeholder="Not recorded"
                options={AVAILABILITY.map((a) => ({ value: a, label: AVAILABILITY_LABEL[a] }))}
                onChange={(x: string | null) => set("availability")(x as MarketInput["availability"])} presentation="adaptive" status={error(errors.availability)} />
            </Grid>
            <TextInput label="Transfer conditions" htmlName="transferConditions" value={v.transferConditions ?? ""} onChange={(x) => set("transferConditions")(x)}
              isOptional placeholder="e.g. Fee negotiable, sell-on clause 15%" status={error(errors.transferConditions)} />
            <TextInput label="Representative" htmlName="representative" value={v.representative ?? ""} onChange={(x) => set("representative")(x)}
              isOptional placeholder="Agent or agency, if any" status={error(errors.representative)} />
          </>
        )}
        <HStack><Button type="submit" variant="primary" label="Save market details" isLoading={pending} /></HStack>
      </VStack>
    </Form>
  );
}

export function TestForm({ playerId, kinds, canVerify, today }: {
  playerId: string; kinds: { value: string; label: string }[]; canVerify: boolean; today: string;
}) {
  const [state, action, pending] = useActionState(addTest, null);
  const [test, setTest] = useState<string | undefined>(undefined);
  const [value, setValue] = useState<number | null>(null);
  const [testedAt, setTestedAt] = useState<string | undefined>(today);
  const [verified, setVerified] = useState(false);
  const errors = state?.errors ?? {};
  const range = test ? TEST_RANGE[test] : undefined;
  return (
    <Form action={action} noValidate>
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="testedAt" value={testedAt ?? ""} />
      <VStack gap={4}>
        <Errors title="The test was not added" errors={errors} />
        <Grid columns={{ minWidth: 200, repeat: "fill" }} gap={4}>
          <Selector label="Test" htmlName="test" options={kinds} value={test} onChange={setTest} isRequired placeholder="Choose a test"
            presentation="adaptive" status={error(errors.test)} />
          <NumberInput label={range?.unit ? `Result (${range.unit})` : "Result"} htmlName="value" value={value} onChange={(x: number | null) => setValue(x)}
            step={0.01} hasClear isRequired description={range ? `Usually ${range.min} to ${range.max}` : undefined} status={error(errors.value)} />
          <DateInput label="Tested on" value={iso(testedAt)} onChange={setTestedAt} max={iso(today)} isRequired status={error(errors.testedAt)} />
        </Grid>
        {canVerify && (
          <CheckboxInput label="Verified" htmlName="verified" value={verified} onChange={setVerified}
            description="Tick only if you watched the test or hold the signed test sheet." />
        )}
        <HStack><Button type="submit" variant="primary" label="Add test" isLoading={pending} /></HStack>
      </VStack>
    </Form>
  );
}
