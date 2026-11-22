import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting, type Q } from "@/lib/auth";
import { ROLE_NAMES } from "@/lib/metrics";
import { currentMatches } from "@/lib/queries";
import { newMatches } from "@/lib/search";
import { ActionForm, Submit } from "../forms";
import { PageHead, PlayerCell, when } from "../page-kit";
import { Demo } from "../ui";
import { deleteSearch, markSeen } from "./actions";

export const dynamic = "force-dynamic";

type Saved = { id: string; name: string; query: string; seen_player_ids: string[]; checked_at: Date; is_demo: boolean };
type P = { id: string; display_name: string; id_verified: boolean; primary_position: string | null };

export default async function Searches() {
  await requireScouting();
  return db((tx) => SearchesPage(tx));
}

async function SearchesPage(tx: Q) {
  const saved = await tx<Saved[]>`select id, name, query, seen_player_ids, checked_at, is_demo from saved_searches order by checked_at desc`;
  const alerts = await Promise.all(saved.map(async (s) => {
    const { description, ids } = await currentMatches(tx, s.query);
    const fresh = newMatches(ids, s.seen_player_ids);
    const players = fresh.length
      ? await tx<P[]>`select id, display_name, id_verified, primary_position from players where id = any(${fresh}::uuid[]) order by display_name limit 50`
      : [];
    return { ...s, description, total: ids.length, fresh, players };
  }));

  return (
    <VStack gap={6}>
      <PageHead title="Saved searches" intro="Each search remembers the players it matched. When new players match, because a match was published or a profile went live, they are listed here until you mark them as seen." />
      {alerts.length === 0 && (
        <Card>
          <EmptyState title="No saved searches yet" description="Set the filters on the search page, then use Save this search under them." actions={<Button variant="primary" label="Go to search" href="/" />} />
        </Card>
      )}
      {alerts.map((s) => (
        <Card key={s.id}>
          <VStack gap={3}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
              <VStack gap={1}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Heading level={3}>{s.name}</Heading>
                  {s.fresh.length > 0 && <Badge variant="green" label={`${s.fresh.length} new`} />}
                  {s.is_demo && <Demo />}
                </HStack>
                <Text type="supporting">{s.description}</Text>
                <Text type="supporting">{s.total} players match today · last marked as seen {when(s.checked_at)}</Text>
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button size="sm" label="Open search" href={`/?${s.query}`} />
                {s.fresh.length > 0 && (
                  <ActionForm action={markSeen}><input type="hidden" name="id" value={s.id} /><Submit size="sm" variant="secondary" label="Mark as seen" /></ActionForm>
                )}
                <ActionForm action={deleteSearch}><input type="hidden" name="id" value={s.id} /><Submit size="sm" variant="ghost" label="Delete" /></ActionForm>
              </HStack>
            </HStack>
            {s.fresh.length === 0 ? (
              <Text type="supporting">No new players since you last looked.</Text>
            ) : (
              <Table density="compact">
                <TableHeader><TableRow><TableHeaderCell>New since {when(s.checked_at)}</TableHeaderCell></TableRow></TableHeader>
                <TableBody>
                  {s.players.map((p) => (
                    <TableRow key={p.id}><TableCell><PlayerCell p={{ ...p, position: p.primary_position && (ROLE_NAMES[p.primary_position] ?? p.primary_position) }} /></TableCell></TableRow>
                  ))}
                  {s.fresh.length > s.players.length && (
                    <TableRow><TableCell><Text type="supporting">and {s.fresh.length - s.players.length} more; open the search to see them all.</Text></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}
