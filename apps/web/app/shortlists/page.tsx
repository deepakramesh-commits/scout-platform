import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Me, type Q } from "@/lib/auth";
import { ROLE_NAMES } from "@/lib/metrics";
import { ActionForm, Area, Field, Num, Submit } from "../forms";
import { PlayerFinder } from "../player-finder";
import { PageHead, PlayerCell } from "../page-kit";
import { RequestIntro } from "../player-actions";
import { Demo } from "../ui";
import { addToShortlist, createShortlist, deleteShortlist, removeFromShortlist, renameShortlist, updateShortlistEntry } from "../workflow-actions";

export const dynamic = "force-dynamic";

type List = { id: string; name: string; is_demo: boolean; players: number };
type Entry = {
  player_id: string; note: string | null; rank: number; display_name: string | null; id_verified: boolean; primary_position: string | null; is_demo: boolean;
};

export default async function Shortlists({ searchParams }: { searchParams: Promise<{ list?: string; find?: string }> }) {
  const user = await requireMe(["scout", "agent", "admin"]);
  const { list, find } = await searchParams;
  return db((tx) => ShortlistsPage(tx, user, list, find));
}

async function ShortlistsPage(tx: Q, user: Me, wanted: string | undefined, find: string | undefined) {
  const lists = await tx<List[]>`
    select s.id, s.name, s.is_demo, (select count(*)::int from shortlist_players sp where sp.shortlist_id = s.id) as players
    from shortlists s order by s.created_at`;
  const current = lists.find((l) => l.id === wanted) ?? lists[0];
  const entries = current
    ? await
        tx<Entry[]>`
          select sp.player_id, sp.note, sp.rank, p.display_name, coalesce(p.id_verified, false) as id_verified, p.primary_position, coalesce(p.is_demo, false) as is_demo
          from shortlist_players sp left join players p on p.id = sp.player_id
          where sp.shortlist_id = ${current.id} order by nullif(sp.rank, 0) nulls last, p.display_name`
    : [];

  return (
    <VStack gap={6}>
      <PageHead title="Shortlists" intro="Keep the players you are following, ranked, with a note on each. The shadow team lays a shortlist out on the pitch." />
      <VStack gap={4}>
        <Card>
          <VStack gap={4}>
            <Heading level={3}>Your shortlists</Heading>
            {lists.length === 0 && <Text type="supporting">None yet. Name your first one below.</Text>}
            <HStack gap={4} wrap="wrap">
              {lists.map((l) => (
                <HStack key={l.id} gap={2} vAlign="center" wrap="wrap">
                  {l.id === current?.id ? <Text weight="semibold">{l.name}</Text> : <Link href={`/shortlists?list=${l.id}`}>{l.name}</Link>}
                  <Text type="supporting">{l.players} {l.players === 1 ? "player" : "players"}</Text>
                  {l.is_demo && <Demo />}
                </HStack>
              ))}
            </HStack>
            <ActionForm action={createShortlist}>
              <HStack gap={2} vAlign="end" wrap="wrap">
                <Field label="New shortlist" name="name" placeholder="e.g. Left wingers, summer window" width={240} />
                <Submit label="Create" variant="secondary" />
              </HStack>
            </ActionForm>
          </VStack>
        </Card>

        {current ? (
          <Card>
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="end" wrap="wrap" gap={2}>
                <ActionForm action={renameShortlist}>
                  <input type="hidden" name="list" value={current.id} />
                  <HStack gap={2} vAlign="end" wrap="wrap">
                    <Field label="Shortlist name" name="name" value={current.name} width={240} />
                    <Submit label="Rename" variant="ghost" />
                  </HStack>
                </ActionForm>
                <HStack gap={2}>
                  <Button size="sm" label="Shadow team" href={`/shadow-team?list=${current.id}`} />
                  <ActionForm action={deleteShortlist}>
                    <input type="hidden" name="list" value={current.id} />
                    <Submit label="Delete shortlist" variant="ghost" size="sm" />
                  </ActionForm>
                </HStack>
              </HStack>

              <PlayerFinder label="Add a player" path="/shortlists" params={{ list: current.id }} q={find} action={(id) => (
                <ActionForm action={addToShortlist}>
                  <input type="hidden" name="list" value={current.id} />
                  <input type="hidden" name="player" value={id} />
                  <Submit label={entries.some((e) => e.player_id === id) ? "On the list" : "Add"} variant="secondary" size="sm" />
                </ActionForm>
              )} />

              {entries.length === 0 ? (
                <EmptyState isCompact title="No players on this shortlist" description="Add one above, or from a player's profile." />
              ) : (
                <Table density="compact" verticalAlign="top" style={{ minWidth: "44rem" }}>
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell style={{ width: "30%" }}>Player</TableHeaderCell>
                      <TableHeaderCell>Rank and note</TableHeaderCell>
                      {user.role === "scout" && <TableHeaderCell style={{ width: "28%" }}>Introduction</TableHeaderCell>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.player_id}>
                        <TableCell>
                          <VStack gap={2}>
                            {e.display_name
                              ? <PlayerCell p={{ id: e.player_id, display_name: e.display_name, id_verified: e.id_verified, position: e.primary_position && (ROLE_NAMES[e.primary_position] ?? e.primary_position), is_demo: e.is_demo }} />
                              : <Text type="supporting">Profile no longer available (consent withdrawn or awaiting approval)</Text>}
                            <ActionForm action={removeFromShortlist}>
                              <input type="hidden" name="list" value={current.id} />
                              <input type="hidden" name="player" value={e.player_id} />
                              <HStack><Submit label="Remove" variant="ghost" size="sm" /></HStack>
                            </ActionForm>
                          </VStack>
                        </TableCell>
                        <TableCell>
                          <ActionForm action={updateShortlistEntry} done="Saved.">
                            <input type="hidden" name="list" value={current.id} />
                            <input type="hidden" name="player" value={e.player_id} />
                            <HStack gap={2} vAlign="end" wrap="wrap">
                              <Num label="Rank" name="rank" value={e.rank || null} min={1} max={99} width={90} />
                              <Area label="Note" name="note" value={e.note ?? ""} rows={2} maxLength={1000} placeholder="Why he is on the list" />
                              <Submit label="Save" variant="secondary" size="sm" />
                            </HStack>
                          </ActionForm>
                        </TableCell>
                        {user.role === "scout" && <TableCell>{e.display_name && <RequestIntro playerId={e.player_id} compact />}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </VStack>
          </Card>
        ) : (
          <Card><EmptyState title="Start a shortlist" description="Name it on the left, then add players here or from their profiles." /></Card>
        )}
      </VStack>
    </VStack>
  );
}
