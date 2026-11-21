"use client";

import { useState, useTransition } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { ShareResult } from "./actions";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Print, and (for the report's owner) a share link to copy. Hidden on paper by `.no-print`. */
export function ReportTools({ share, children }: { share?: () => Promise<ShareResult>; children?: React.ReactNode }) {
  const [result, setResult] = useState<ShareResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const link = result?.ok ? result : null;

  return (
    <VStack gap={3} className="no-print">
      <HStack gap={3} wrap="wrap" vAlign="end" hAlign="between">
        {children}
        <HStack gap={2} wrap="wrap">
          <Button label="Print or save as PDF" onClick={() => window.print()} />
          {share && (
            <Button variant="primary" label="Share link" isLoading={pending}
              onClick={() => start(async () => { setCopied(false); setResult(await share()); })} />
          )}
        </HStack>
      </HStack>
      {result && !result.ok && <Banner status="error" title={result.error} collapsible={false} />}
      {link && (
        <VStack gap={1}>
          <HStack gap={2} vAlign="end" wrap="wrap">
            <TextInput label="Read-only link" value={link.url} onChange={() => {}} isReadOnly width="min(100%, 36rem)" />
            <Button label={copied ? "Copied" : "Copy"}
              onClick={() => navigator.clipboard.writeText(link.url).then(() => setCopied(true), () => setCopied(false))} />
          </HStack>
          <Text type="supporting">
            Anyone with the link reads this report as you see it, until {day(link.expiresAt)}. It stops working at once if the player withdraws consent.
          </Text>
        </VStack>
      )}
    </VStack>
  );
}
