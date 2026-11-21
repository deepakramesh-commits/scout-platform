"use client";

import Form from "next/form";
import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";

type Option = { value: string; label: string };
type Query = { role: string | null; sort: string; minPct: number | null; name: string | null; minMinutes: number | null };

// A GET form: the URL stays the source of truth, so presets, links and the back button all agree with the filters.
export function Filters({ roles, metrics, initial }: { roles: Option[]; metrics: Option[]; initial: Query }) {
  const [q, setQ] = useState(initial);
  const set = <K extends keyof Query>(k: K) => (v: Query[K]) => setQ((s) => ({ ...s, [k]: v }));
  return (
    <Form action="/">
      <HStack gap={3} wrap="wrap" vAlign="end">
        <Selector label="Position" htmlName="role" options={roles} value={q.role} onChange={set("role")} hasClear placeholder="Any" width={190} placement="below" />
        <Selector label="Rank by" htmlName="sort" options={metrics} value={q.sort} onChange={(v) => v && set("sort")(v)} hasSearch width={200} />
        <NumberInput label="Min percentile" htmlName="minPct" value={q.minPct} onChange={set("minPct")} min={0} max={100} isIntegerOnly hasClear width={140} />
        <NumberInput label="Min minutes" htmlName="minMinutes" value={q.minMinutes} onChange={set("minMinutes")} min={0} isIntegerOnly hasClear width={140} />
        <TextInput label="Name" htmlName="name" type="search" value={q.name ?? ""} onChange={(v) => set("name")(v || null)} placeholder="e.g. Sarr" width={180} />
        <Button type="submit" variant="primary" label="Search" />
      </HStack>
    </Form>
  );
}
