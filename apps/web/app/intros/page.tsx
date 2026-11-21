import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Me, type Q } from "@/lib/auth";
import { ActionForm, Choice, Submit } from "../forms";
import { PageHead, PlayerCell, when } from "../page-kit";
import { INTRO_STATUS } from "../player-actions";
import { Demo } from "../ui";
import { setIntroStatus } from "../workflow-actions";

export const dynamic = "force-dynamic";

type Intro = {
  id: string; player_id: string; display_name: string | null; id_verified: boolean; club: string; requested_by: string | null;
  message: string; status: keyof typeof INTRO_STATUS; created_at: Date; is_demo: boolean;
};
const STATUS_COLOR = { new: "blue", in_progress: "teal", closed: "gray" } as const;
const STATUS_OPTIONS = Object.entries(INTRO_STATUS).map(([value, label]) => ({ value, label }));

export default async function Intros() {
  const user = await requireMe(["scout", "agent", "admin"]);
  return db((tx) => IntrosPage(tx, user));
}

async function IntrosPage(tx: Q, user: Me) {
  const intros = await tx<Intro[]>`
    select i.id, i.player_id, p.display_name, coalesce(p.id_verified, false) as id_verified, o.name as club,
           u.display_name as requested_by, i.message, i.status, i.created_at, i.is_demo
    from intro_requests i left join players p on p.id = i.player_id join orgs o on o.id = i.from_org
    left join app_users u on u.id = i.from_user
    order by i.status = 'closed', i.created_at desc limit 200`;
  const canUpdate = user.is_partner_agency;
  const intro = canUpdate
    ? "Clubs asking to be introduced to a player. Requests are recorded here; you follow up with the club directly."
    : user.role === "scout"
      ? "Your club's requests to the partner agency, and where each one stands."
      : user.role === "admin"
        ? "Every introduction request. Only the partner agency changes their status."
        : "Introduction requests go to the licensed partner agency only.";

  return (
    <VStack gap={6}>
      <PageHead title="Introduction requests" intro={intro} />
      {intros.length === 0 ? (
        <Card><EmptyState title="No introduction requests" description={user.role === "scout" ? "Request one from a player's profile, your shortlist or your inbox." : "Requests from clubs appear here."} /></Card>
      ) : (
        <Card>
          <Table density="compact" verticalAlign="top" style={{ minWidth: "46rem" }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: "26%" }}>Player</TableHeaderCell>
                <TableHeaderCell>Club</TableHeaderCell>
                <TableHeaderCell>Message</TableHeaderCell>
                <TableHeaderCell style={{ width: "24%" }}>Status</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {intros.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.display_name ? <PlayerCell p={{ id: r.player_id, display_name: r.display_name, id_verified: r.id_verified }} /> : <Text type="supporting">Profile no longer available</Text>}
                  </TableCell>
                  <TableCell>
                    <VStack gap={0}>
                      <Text>{r.club}</Text>
                      <HStack gap={1} wrap="wrap"><Text type="supporting">{[r.requested_by, when(r.created_at)].filter(Boolean).join(" · ")}</Text>{r.is_demo && <Demo />}</HStack>
                    </VStack>
                  </TableCell>
                  <TableCell><Text type="supporting">{r.message || "No message"}</Text></TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <ActionForm action={setIntroStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <HStack gap={2} vAlign="end" wrap="wrap">
                          <Choice label="Status" isLabelHidden name="status" options={STATUS_OPTIONS} value={r.status} width={170} />
                          <Submit label="Update" variant="secondary" size="sm" />
                        </HStack>
                      </ActionForm>
                    ) : <Token size="sm" color={STATUS_COLOR[r.status]} label={INTRO_STATUS[r.status]} />}
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
