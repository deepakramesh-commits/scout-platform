// Find a visible player by name and act on each match. A GET form, so the search runs on the server and stays in the URL;
// a dropdown of every player would ship hundreds of options to a phone.
import Form from "next/form";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, TableBody, TableCell, TableRow } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db } from "@/lib/auth";
import { ROLE_NAMES } from "@/lib/metrics";
import { Field } from "./forms";
import { PlayerCell } from "./page-kit";

type Found = { id: string; display_name: string; id_verified: boolean; primary_position: string | null };

export async function PlayerFinder({ label, path, params, q, action }: {
  label: string; path: string; params: Record<string, string>; q: string | undefined; action: (playerId: string) => React.ReactNode;
}) {
  const query = q?.trim() ?? "";
  const found = query.length >= 2
    ? await db((tx) => tx<Found[]>`
        select id, display_name, id_verified, primary_position from players
        where visible_to_scouts and display_name ilike '%' || ${query} || '%' order by display_name limit 8`)
    : null;
  return (
    <VStack gap={2}>
      <Form action={path}>
        {Object.entries(params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <HStack gap={2} vAlign="end" wrap="wrap">
          <Field label={label} name="find" type="search" value={query} placeholder="Player name" width={260} />
          <Button type="submit" label="Find" variant="secondary" />
        </HStack>
      </Form>
      {found && found.length === 0 && <Text type="supporting">No player matches “{query}”.</Text>}
      {found && found.length > 0 && (
        <Table density="compact">
          <TableBody>
            {found.map((p) => (
              <TableRow key={p.id}>
                <TableCell><PlayerCell p={{ ...p, position: p.primary_position && ROLE_NAMES[p.primary_position] }} /></TableCell>
                <TableCell><HStack hAlign="end">{action(p.id)}</HStack></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </VStack>
  );
}
