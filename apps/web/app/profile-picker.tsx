"use client";

import Form from "next/form";
import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector, type SelectorOptionType } from "@astryxdesign/core/Selector";

/** `keep` carries the page's other choices (for example the competition) through the GET form. */
export function ProfilePicker({ action, name, options, value, label = "Requirement profile", keep = {} }: {
  action: string; name: string; options: SelectorOptionType[]; value: string; label?: string; keep?: Record<string, string | null>;
}) {
  const [v, setV] = useState(value);
  return (
    <Form action={action}>
      <HStack gap={3} wrap="wrap" vAlign="end">
        {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <Selector label={label} htmlName={name} options={options} value={v} onChange={setV} width="min(100%, 20rem)" />
        <Button type="submit" label="Show" />
      </HStack>
    </Form>
  );
}
