import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { MATCH_STATUS, type MatchRow } from "@/lib/competition";
import { Demo, flag } from "./ui";

const STATUS_COLOR = { uploaded: "gray", tagging: "blue", review: "yellow", published: "green" } as const;
const date = (d: Date | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Date not set";

export function MatchList({ matches }: { matches: MatchRow[] }) {
  return (
    <Table density="compact" style={{ minWidth: "30rem" }}>
      <TableHeader>
        <TableRow>
          <TableHeaderCell style={{ width: "22%" }}>Date</TableHeaderCell>
          <TableHeaderCell>Match</TableHeaderCell>
          <TableHeaderCell style={{ width: "24%" }}>Status</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {matches.map((m) => (
          <TableRow key={m.id}>
            <TableCell><Text type="supporting" hasTabularNumbers>{date(m.kickoff_at)}</Text></TableCell>
            <TableCell>
              <HStack gap={1} wrap="wrap" vAlign="center">
                <Link href={`/teams/${m.home_id}`}>{flag(m.home)} {m.home}</Link>
                <Text type="supporting">v</Text>
                <Link href={`/teams/${m.away_id}`}>{flag(m.away)} {m.away}</Link>
                {m.is_demo && <Demo />}
              </HStack>
            </TableCell>
            <TableCell><Token size="sm" color={STATUS_COLOR[m.status]} label={MATCH_STATUS[m.status]} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
