import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Q } from "@/lib/auth";
import { ROLE_NAMES } from "@/lib/metrics";
import { SEASON_YEAR } from "@/lib/scouting";
import { ACCOUNT_TYPES, ageOn } from "@/lib/signup";
import { ActionForm, Area, Submit } from "../../forms";
import { PageHead, when } from "../../page-kit";
import { Demo } from "../../ui";
import { activateUser, decideApproval, decideClaim } from "../actions";

export const dynamic = "force-dynamic";

type Pending = {
  id: string; display_name: string; birth_year: number | null; date_of_birth: string | null; origin: "sign_up" | "match_data";
  primary_position: string | null; nationality: string | null; is_demo: boolean;
  guardian_name: string | null; guardian_contact: string | null; guardian_email: string | null; signed_up: Date | null;
};
type Claim = { id: string; created_at: Date; display_name: string; primary_position: string | null; birth_year: number | null; email: string | null; claimant: string | null; role: string };
type Inactive = { id: string; display_name: string | null; email: string | null; role: string };
type Decided = { display_name: string; decision: "approved" | "declined"; note: string; decided_at: Date; by: string | null };

const roleLabel = (role: string) => Object.values(ACCOUNT_TYPES).find((t) => t.role === role)?.label ?? role;

export default async function Approvals() {
  await requireMe(["admin"]);
  return db((tx) => ApprovalsPage(tx));
}

async function ApprovalsPage(tx: Q) {
  const [pending, claims, inactive, decided] = await Promise.all([
    tx<Pending[]>`
      select p.id, p.display_name, p.birth_year, to_char(pi.date_of_birth, 'YYYY-MM-DD') as date_of_birth, p.origin, p.primary_position, p.nationality, p.is_demo,
             c.guardian_name, c.guardian_contact, g.email as guardian_email, c.signed_at as signed_up
      from players p
      left join player_identity pi on pi.player_id = p.id
      left join lateral (select guardian_name, guardian_contact, signed_at from consents where player_id = p.id and revoked_at is null order by signed_at desc limit 1) c on true
      left join app_users g on g.id = p.guardian_id
      where p.status = 'pending_approval'
      order by p.origin desc, c.signed_at nulls last, p.display_name`,
    tx<Claim[]>`
      select c.id, c.created_at, p.display_name, p.primary_position, p.birth_year, u.email, u.display_name as claimant, u.role
      from profile_claims c join players p on p.id = c.player_id join app_users u on u.id = c.user_id
      where c.status = 'pending' order by c.created_at`,
    tx<Inactive[]>`select id, display_name, email, role from app_users where not active order by role, email`,
    tx<Decided[]>`
      select p.display_name, a.decision, a.note, a.decided_at, u.display_name as by
      from approvals a join players p on p.id = a.player_id left join app_users u on u.id = a.decided_by
      order by a.decided_at desc limit 10`,
  ]);
  const today = new Date();
  const age = (p: Pending) => p.date_of_birth ? `${ageOn(p.date_of_birth, today)}` : p.birth_year ? `about ${SEASON_YEAR - p.birth_year}` : "not recorded";

  return (
    <VStack gap={6}>
      <PageHead title="Approvals" intro="Under-18 profiles wait here until one of us approves them. Profile claims and staff accounts are switched on here too." />

      <Card>
        <VStack gap={4}>
          <HStack gap={2} vAlign="center"><Heading level={3}>Under-18 profiles</Heading><Badge variant="neutral" label={pending.length} /></HStack>
          {pending.length === 0 ? <EmptyState isCompact title="Nothing waiting" description="New under-18 sign-ups, and match-data profiles whose birth date shows they are under 18, appear here." /> : (
            <Table density="compact" verticalAlign="top" style={{ minWidth: "56rem" }}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell style={{ width: "24%" }}>Player</TableHeaderCell>
                  <TableHeaderCell style={{ width: "10%" }}>Age</TableHeaderCell>
                  <TableHeaderCell style={{ width: "26%" }}>Guardian</TableHeaderCell>
                  <TableHeaderCell>Decision</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <VStack gap={1}>
                        <HStack gap={1} wrap="wrap" vAlign="center"><Text weight="semibold">{p.display_name}</Text>{p.is_demo && <Demo />}</HStack>
                        <Text type="supporting">{[p.primary_position && ROLE_NAMES[p.primary_position], p.nationality].filter(Boolean).join(" · ") || "Position not given"}</Text>
                        <Token size="sm" color={p.origin === "sign_up" ? "blue" : "gray"} label={p.origin === "sign_up" ? `Signed up ${p.signed_up ? when(p.signed_up) : ""}` : "From match data"} />
                      </VStack>
                    </TableCell>
                    <TableCell>
                      <VStack gap={0}><Text hasTabularNumbers>{age(p)}</Text><Text type="supporting">{p.date_of_birth ?? (p.birth_year ? `born ${p.birth_year}` : "")}</Text></VStack>
                    </TableCell>
                    <TableCell>
                      {p.guardian_name || p.guardian_contact || p.guardian_email ? (
                        <VStack gap={0}>
                          <Text>{p.guardian_name ?? "Name not given"}</Text>
                          {p.guardian_contact && <Text type="supporting">{p.guardian_contact}</Text>}
                          {p.guardian_email && <Text type="supporting">Account {p.guardian_email}</Text>}
                        </VStack>
                      ) : <Text type="supporting">No guardian on record yet (profile built from match data)</Text>}
                    </TableCell>
                    <TableCell>
                      <ActionForm action={decideApproval}>
                        <input type="hidden" name="player" value={p.id} />
                        <Area label="Note" name="note" rows={2} maxLength={500} placeholder="Required to decline; the player and guardian see it" />
                        <HStack gap={2}>
                          <Submit label="Approve" name="decision" value="approved" size="sm" />
                          <Submit label="Decline" name="decision" value="declined" variant="destructive" size="sm" />
                        </HStack>
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
          <HStack gap={2} vAlign="center"><Heading level={3}>Profile claims</Heading><Badge variant="neutral" label={claims.length} /></HStack>
          <Text type="supporting">A player or guardian says a profile built from match data is theirs. Check it is them before approving; approval links the account to the profile.</Text>
          {claims.length === 0 ? <Text type="supporting">No claims waiting.</Text> : (
            <Table density="compact" verticalAlign="top" style={{ minWidth: "46rem" }}>
              <TableHeader><TableRow><TableHeaderCell>Profile</TableHeaderCell><TableHeaderCell>Claimed by</TableHeaderCell><TableHeaderCell>Decision</TableHeaderCell></TableRow></TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><VStack gap={0}><Text weight="semibold">{c.display_name}</Text><Text type="supporting">{[c.primary_position, c.birth_year && `born ${c.birth_year}`].filter(Boolean).join(" · ")}</Text></VStack></TableCell>
                    <TableCell><VStack gap={0}><Text>{c.claimant}</Text><Text type="supporting">{roleLabel(c.role)} · {c.email} · {when(c.created_at)}</Text></VStack></TableCell>
                    <TableCell>
                      <ActionForm action={decideClaim}>
                        <input type="hidden" name="claim" value={c.id} />
                        <Area label="Note" name="note" rows={2} maxLength={500} placeholder="Required to decline" />
                        <HStack gap={2}>
                          <Submit label="Approve" name="decision" value="approved" size="sm" />
                          <Submit label="Decline" name="decision" value="declined" variant="destructive" size="sm" />
                        </HStack>
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
          <HStack gap={2} vAlign="center"><Heading level={3}>Accounts waiting to be switched on</Heading><Badge variant="neutral" label={inactive.length} /></HStack>
          <Text type="supporting">Analyst accounts start switched off: staff roles are never self-granted.</Text>
          {inactive.length === 0 ? <Text type="supporting">None waiting.</Text> : (
            <Table density="compact">
              <TableBody>
                {inactive.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell><VStack gap={0}><Text weight="semibold">{u.display_name ?? u.email}</Text><Text type="supporting">{roleLabel(u.role)} · {u.email}</Text></VStack></TableCell>
                    <TableCell>
                      <ActionForm action={activateUser}><input type="hidden" name="user" value={u.id} /><HStack hAlign="end"><Submit label="Switch on" size="sm" variant="secondary" /></HStack></ActionForm>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Heading level={3}>Recent decisions</Heading>
          {decided.length === 0 ? <Text type="supporting">No decisions yet.</Text> : (
            <Table density="compact" style={{ minWidth: "36rem" }}>
              <TableBody>
                {decided.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell><Text>{d.display_name}</Text></TableCell>
                    <TableCell><Token size="sm" color={d.decision === "approved" ? "green" : "red"} label={d.decision === "approved" ? "Approved" : "Declined"} /></TableCell>
                    <TableCell><Text type="supporting">{d.note || "–"}</Text></TableCell>
                    <TableCell><Text type="supporting">{[d.by, when(d.decided_at)].filter(Boolean).join(" · ")}</Text></TableCell>
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
