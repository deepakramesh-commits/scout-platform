"use client";

import Form from "next/form";
import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector, type SelectorOptionType } from "@astryxdesign/core/Selector";

export function ProfilePicker({ action, name, options, value, label = "Requirement profile" }: {
  action: string; name: string; options: SelectorOptionType[]; value: string; label?: string;
}) {
  const [v, setV] = useState(value);
  return (
    <Form action={action}>
      <HStack gap={3} wrap="wrap" vAlign="end">
        <Selector label={label} htmlName={name} options={options} value={v} onChange={setV} width="min(100%, 20rem)" />
        <Button type="submit" label="Show" />
      </HStack>
    </Form>
  );
}
