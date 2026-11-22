import { notFound } from "next/navigation";
import { Card } from "@astryxdesign/core/Card";
import { Kbd } from "@astryxdesign/core/Kbd";
import { Link } from "@astryxdesign/core/Link";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { requireMe } from "@/lib/auth";
import { BODY_PARTS, EVENT_SPEC } from "@/lib/event-spec";
import { readStandard } from "@/lib/standards";

export default async function Standard({ params }: { params: Promise<{ slug: string }> }) {
  await requireMe();
  const { slug } = await params;
  const doc = await readStandard(slug);
  if (!doc) notFound();
  return (
    <VStack gap={5}>
      <Link href="/standards">All standards</Link>
      <Card>
        <Markdown headingLevelStart={1} contentWidth={760}>{doc.markdown}</Markdown>
      </Card>
      {slug === "event-definitions" && (
        <Card padding={0}>
          <VStack gap={1} padding={4}>
            <Heading level={2}>Every event type</Heading>
            <Text type="supporting">Generated from the event spec the log tool, the import and the quality check use. The key is the event log shortcut. Body part, where allowed: {BODY_PARTS.map((b) => b.label).join(", ")}.</Text>
          </VStack>
          <Table density="compact" verticalAlign="top">
            <TableHeader>
              <TableRow><TableHeaderCell>Type</TableHeaderCell><TableHeaderCell>Key</TableHeaderCell><TableHeaderCell>Outcomes</TableHeaderCell><TableHeaderCell>Flags and choices</TableHeaderCell><TableHeaderCell>Definition</TableHeaderCell></TableRow>
            </TableHeader>
            <TableBody>
              {EVENT_SPEC.map((e) => (
                <TableRow key={e.type}>
                  <TableCell><VStack gap={0.5}><Text weight="semibold">{e.label}</Text><Text type="supporting">{e.type} · StatsBomb {e.statsbomb}{e.end === "required" ? " · needs an end location" : ""}</Text></VStack></TableCell>
                  <TableCell><Kbd keys={e.key.toUpperCase()} /></TableCell>
                  <TableCell>{e.outcomes.length ? e.outcomes.map((o) => `${o.label} (${o.value})`).join(", ") : "None"}</TableCell>
                  <TableCell>
                    <VStack gap={0.5}>
                      {e.flags.map((f) => <Text key={f.key} type="supporting"><Text weight="semibold" type="supporting">{f.label}</Text>: {f.definition}</Text>)}
                      {e.choices?.map((c) => <Text key={c.key} type="supporting"><Text weight="semibold" type="supporting">{c.label}</Text>: {c.options.map((o) => o.label).join(", ")}</Text>)}
                      {!e.flags.length && !e.choices?.length && <Text type="supporting">None</Text>}
                    </VStack>
                  </TableCell>
                  <TableCell>{e.definition}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </VStack>
  );
}
