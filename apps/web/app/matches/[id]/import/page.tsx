import { Card } from "@astryxdesign/core/Card";
import { Link } from "@astryxdesign/core/Link";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db } from "@/lib/auth";
import { loadTool } from "@/lib/engine";
import { CSV_COLUMNS } from "@/lib/import";
import { MatchHeader } from "../match-header";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

type Past = { filename: string; format: string; rows_imported: number; created_at: Date; by: string | null };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { match } = await loadTool(id, ["analyst"]);
  const [past, [{ players }]] = await db((tx) => Promise.all([
    tx<Past[]>`select i.filename, i.format, i.rows_imported, i.created_at, u.display_name as by
               from imports i left join app_users u on u.id = i.created_by where i.match_id = ${id} order by i.created_at desc`,
    tx<{ players: number }[]>`select count(*)::int as players from lineups where match_id = ${id}`,
  ]));
  return (
    <VStack gap={5} maxWidth={960}>
      <MatchHeader match={match} tool="Import events" intro="Bring in events logged in another tagging tool. Players are matched by team and shirt number on the match sheet, every row is checked against the event spec, and one bad row stops the whole import." />
      <Card>
        <VStack gap={3}>
          <Heading level={2}>Import a file</Heading>
          {players === 0 && <Text color="secondary">The match sheet is still empty. The coordinator fills it first, so the import can find each player.</Text>}
          <ImportForm matchId={id} />
        </VStack>
      </Card>
      <Card>
        <VStack gap={3}>
          <Heading level={2}>Earlier imports</Heading>
          {past.length === 0 ? <Text color="secondary">None yet.</Text> : (
            <Table density="compact">
              <TableHeader><TableRow><TableHeaderCell>File</TableHeaderCell><TableHeaderCell>Format</TableHeaderCell><TableHeaderCell>Events</TableHeaderCell><TableHeaderCell>By</TableHeaderCell><TableHeaderCell>When</TableHeaderCell></TableRow></TableHeader>
              <TableBody>
                {past.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.filename}</TableCell><TableCell>{p.format === "csv" ? "CSV" : "StatsBomb JSON"}</TableCell>
                    <TableCell>{p.rows_imported}</TableCell><TableCell>{p.by ?? "Unknown"}</TableCell><TableCell>{p.created_at.toISOString().slice(0, 16).replace("T", " ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </VStack>
      </Card>
      <Card>
        <VStack gap={3}>
          <Heading level={2}>CSV layout</Heading>
          <Text color="secondary">One row per event with a header row naming these columns, in any order. <Link href="/standards/import-csv">The full layout with an example</Link>.</Text>
          <Table density="compact">
            <TableHeader><TableRow><TableHeaderCell>Column</TableHeaderCell><TableHeaderCell>Values</TableHeaderCell></TableRow></TableHeader>
            <TableBody>
              {CSV_COLUMNS.map(([c, v]) => <TableRow key={c}><TableCell><Text weight="semibold">{c}</Text></TableCell><TableCell>{v}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </VStack>
      </Card>
    </VStack>
  );
}
