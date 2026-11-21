import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Me, type Q } from "@/lib/auth";
import { ROLE_NAMES } from "@/lib/metrics";
import { ActionForm, Area, Choice, Submit } from "../forms";
import { PageHead, PlayerCell, when } from "../page-kit";
import { PlayerFinder } from "../player-finder";
import { Demo } from "../ui";
import { addClient, removeClient, sendProfile } from "../workflow-actions";

export const dynamic = "force-dynamic";

type Client = { id: string; display_name: string; id_verified: boolean; primary_position: string | null; is_demo: boolean; added_at: Date; visible: boolean };
type Sent = { id: string; player_id: string; display_name: string | null; id_verified: boolean; club: string; message: string; created_at: Date; is_demo: boolean };

export default async function Agent({ searchParams }: { searchParams: Promise<{ find?: string }> }) {
  const user = await requireMe(["agent"]);
  const { find } = await searchParams;
  return db((tx) => AgentPage(tx, user, find));
}

async function AgentPage(tx: Q, user: Me, find: string | undefined) {
  const [clients, clubs, sent] = await Promise.all([
    tx<Client[]>`
      select p.id, p.display_name, p.id_verified, p.primary_position, a.is_demo, a.added_at, p.visible_to_scouts as visible
      from agent_clients a join players p on p.id = a.player_id order by p.display_name`,
    tx<{ id: string; name: string }[]>`select id, name from orgs where kind = 'club' order by name`,
    tx<Sent[]>`
      select s.id, s.player_id, p.display_name, coalesce(p.id_verified, false) as id_verified, o.name as club, s.message, s.created_at, s.is_demo
      from profile_shares s left join players p on p.id = s.player_id join orgs o on o.id = s.to_org
      where s.from_org = ${user.org_id} order by s.created_at desc limit 50`,
  ]);
  const option = (p: { id: string; display_name: string; primary_position: string | null }) =>
    ({ value: p.id, label: p.primary_position ? `${p.display_name} · ${p.primary_position}` : p.display_name });

  return (
    <VStack gap={6}>
      <PageHead title="Clients and profiles sent" intro={`${user.org_name ?? "Your agency"}: the players you represent, and the profiles you have sent to clubs. Representation never changes a ranking or a score.`} />

      <Card>
        <VStack gap={4}>
          <Heading level={3}>Your clients</Heading>
          <PlayerFinder label="Add a client" path="/agent" params={{}} q={find} action={(id) => (
            <ActionForm action={addClient}>
              <input type="hidden" name="player" value={id} />
              <Submit label={clients.some((c) => c.id === id) ? "Client" : "Add client"} variant="secondary" size="sm" />
            </ActionForm>
          )} />
          {clients.length === 0 ? (
            <EmptyState isCompact title="No clients yet" description="Add the players your agency represents to track them here." />
          ) : (
            <Table density="compact" style={{ minWidth: "30rem" }}>
              <TableHeader><TableRow><TableHeaderCell>Player</TableHeaderCell><TableHeaderCell>Client since</TableHeaderCell><TableHeaderCell> </TableHeaderCell></TableRow></TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <PlayerCell p={{ ...c, position: c.primary_position && ROLE_NAMES[c.primary_position] }} />
                      {!c.visible && <Text type="supporting">Not visible to clubs: awaiting approval or consent withdrawn</Text>}
                    </TableCell>
                    <TableCell><Text type="supporting">{when(c.added_at)}</Text></TableCell>
                    <TableCell>
                      <ActionForm action={removeClient}>
                        <input type="hidden" name="player" value={c.id} />
                        <HStack hAlign="end"><Submit label="Remove" variant="ghost" size="sm" /></HStack>
                      </ActionForm>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </VStack>
      </Card>

      <Card>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={3}>Send a profile to a club</Heading>
            <Text type="supporting">Send a client's profile; the club sees it in its inbox with your message.</Text>
          </VStack>
          <ActionForm action={sendProfile} done="Sent. The club sees it in its inbox.">
            <HStack gap={2} vAlign="end" wrap="wrap">
              <Choice label="Client" name="player" placeholder={clients.length ? "Choose a client" : "Add a client first"} width={300} options={clients.map(option)} />
              <Choice label="Club" name="club" hasSearch placeholder="Choose a club" width={260} options={clubs.map((c) => ({ value: c.id, label: c.name }))} />
            </HStack>
            <Area label="Message" name="message" rows={3} maxLength={1000} placeholder="Why this player fits the club" />
            <HStack><Submit label="Send profile" /></HStack>
          </ActionForm>
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Heading level={3}>Sent</Heading>
          {sent.length === 0 ? <Text type="supporting">No profiles sent yet.</Text> : (
            <Table density="compact" verticalAlign="top" style={{ minWidth: "40rem" }}>
              <TableHeader><TableRow><TableHeaderCell>Player</TableHeaderCell><TableHeaderCell>To</TableHeaderCell><TableHeaderCell>Message</TableHeaderCell><TableHeaderCell>Sent</TableHeaderCell></TableRow></TableHeader>
              <TableBody>
                {sent.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.display_name ? <PlayerCell p={{ id: s.player_id, display_name: s.display_name, id_verified: s.id_verified, is_demo: s.is_demo }} /> : <Text type="supporting">Profile hidden</Text>}</TableCell>
                    <TableCell><Text>{s.club}</Text></TableCell>
                    <TableCell><Text type="supporting">{s.message || "–"}</Text></TableCell>
                    <TableCell><HStack gap={1}><Text type="supporting">{when(s.created_at)}</Text>{s.is_demo && <Demo />}</HStack></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
