import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Me, type Q } from "@/lib/auth";
import { ROLE_NAMES } from "@/lib/metrics";
import { PageHead, PlayerCell, when } from "../page-kit";
import { AddToShortlist, RequestIntro } from "../player-actions";
import { Demo } from "../ui";

export const dynamic = "force-dynamic";

type Share = {
  id: string; player_id: string; display_name: string | null; id_verified: boolean; primary_position: string | null;
  agency: string; message: string; created_at: Date; is_demo: boolean;
};

export default async function Inbox() {
  const user = await requireMe(["scout", "admin"]);
  return db((tx) => InboxPage(tx, user));
}

async function InboxPage(tx: Q, user: Me) {
  const shares = await tx<Share[]>`
    select s.id, s.player_id, p.display_name, coalesce(p.id_verified, false) as id_verified, p.primary_position,
           o.name as agency, s.message, s.created_at, s.is_demo
    from profile_shares s left join players p on p.id = s.player_id join orgs o on o.id = s.from_org
    where s.to_org = ${user.org_id} order by s.created_at desc limit 100`;
  return (
    <VStack gap={6}>
      <PageHead title="Inbox" intro={`Player profiles that agents have sent to ${user.org_name ?? "your club"}. Ratings and rankings are the same as everyone else sees.`}
        actions={<Button label="Your introduction requests" href="/intros" />} />
      {shares.length === 0 ? (
        <Card><EmptyState title="Nothing sent to your club yet" description="When an agent sends your club a player's profile, it appears here with the agent's message." /></Card>
      ) : (
        <Card>
          <Table density="compact" verticalAlign="top" style={{ minWidth: "48rem" }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: "26%" }}>Player</TableHeaderCell>
                <TableHeaderCell>From</TableHeaderCell>
                <TableHeaderCell>Message</TableHeaderCell>
                <TableHeaderCell style={{ width: "30%" }}>Next step</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shares.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.display_name
                      ? <PlayerCell p={{ id: s.player_id, display_name: s.display_name, id_verified: s.id_verified, position: s.primary_position && ROLE_NAMES[s.primary_position], is_demo: s.is_demo }} />
                      : <Text type="supporting">Profile no longer available</Text>}
                  </TableCell>
                  <TableCell>
                    <VStack gap={0}><Text>{s.agency}</Text><HStack gap={1}><Text type="supporting">{when(s.created_at)}</Text>{s.is_demo && <Demo />}</HStack></VStack>
                  </TableCell>
                  <TableCell><Text type="supporting">{s.message || "No message"}</Text></TableCell>
                  <TableCell>
                    {s.display_name && user.role === "scout" && (
                      <VStack gap={3}><AddToShortlist playerId={s.player_id} /><RequestIntro playerId={s.player_id} compact /></VStack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </VStack>
  );
}
