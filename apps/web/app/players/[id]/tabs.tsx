"use client";

import { Tab, TabList } from "@astryxdesign/core/TabList";

export function SectionTabs({ tabs, value }: { tabs: { value: string; label: string; href: string }[]; value: string }) {
  return (
    <TabList value={value} onChange={() => {}} hasDivider aria-label="Player sections">
      {tabs.map((t) => <Tab key={t.value} value={t.value} label={t.label} href={t.href} />)}
    </TabList>
  );
}
