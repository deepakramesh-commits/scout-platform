"use client";

import Form from "next/form";
import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector, type SelectorSection } from "@astryxdesign/core/Selector";

export function Pickers({ sections, a, b }: { sections: SelectorSection[]; a: string | null; b: string | null }) {
  const [ids, setIds] = useState({ a, b });
  const picker = (key: "a" | "b") => (
    <Selector label={key === "a" ? "Player A" : "Player B"} htmlName={key} options={sections} value={ids[key] ?? undefined}
      onChange={(v) => setIds((s) => ({ ...s, [key]: v }))} hasSearch searchPlaceholder="Search players" placeholder="Choose a player" width={280} />
  );
  return (
    <Form action="/compare">
      <HStack gap={3} wrap="wrap" vAlign="end">
        {picker("a")}
        {picker("b")}
        <Button type="submit" variant="primary" label="Compare" />
      </HStack>
    </Form>
  );
}
