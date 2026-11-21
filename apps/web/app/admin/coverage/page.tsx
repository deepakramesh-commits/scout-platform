import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Q } from "@/lib/auth";
import { ActionForm, Submit } from "../../forms";
import { PageHead } from "../../page-kit";
import { Demo } from "../../ui";
import { setCoverage } from "../actions";

export const dynamic = "force-dynamic";

type Org = { id: string; name: string; kind: string; is_demo: boolean; is_partner_agency: boolean; users: number };
type Competition = { id: string; name: string; season: string; is_demo: boolean };
type Cover = { org_id: string; competition_id: string; owner: boolean };

const KIND = { club: "Club", agency: "Agency", federation: "Federation", academy: "Academy" } as const;

export default async function Coverage() {
  await requireMe(["admin"]);
  return db((tx) => CoveragePage(tx));
}

async function CoveragePage(tx: Q) {
  const [orgs, competitions, covers] = await Promise.all([
    tx<Org[]>`select o.id, o.name, o.kind, o.is_demo, o.is_partner_agency, (select count(*)::int from app_users u where u.org_id = o.id) as users
              from orgs o where o.kind <> 'internal' order by o.kind, o.name`,
    tx<Competition[]>`select id, name, season, is_demo from competitions order by season desc, name`,
    tx<Cover[]>`select org_id, competition_id, owner from org_coverage`,
  ]);
  const cover = new Map(covers.map((c) => [`${c.org_id}:${c.competition_id}`, c]));

  return (
    <VStack gap={6}>
      <PageHead title="Coverage" intro="A subscription unlocks competitions, not features. An organisation sees matches, events and statistics only in the competitions granted here. A federation that owns a competition also sees its players while they wait for approval." />
      {orgs.length === 0 || competitions.length === 0 ? (
        <Card><EmptyState title="Nothing to grant yet" description="Organisations appear when people sign up; competitions when match data is loaded." /></Card>
      ) : (
        <Card>
          <Table density="compact" verticalAlign="top" style={{ minWidth: `${16 + competitions.length * 14}rem` }}>
            <colgroup>
              <col style={{ width: "16rem" }} />
              {competitions.map((c) => <col key={c.id} style={{ width: "14rem" }} />)}
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Organisation</TableHeaderCell>
                {competitions.map((c) => (
                  <TableHeaderCell key={c.id}>{c.name} {c.season}</TableHeaderCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <VStack gap={0}>
                      <HStack gap={1} wrap="wrap" vAlign="center"><Text weight="semibold">{o.name}</Text>{o.is_demo && <Demo />}</HStack>
                      <Text type="supporting">{KIND[o.kind as keyof typeof KIND] ?? o.kind}{o.is_partner_agency ? " · partner agency" : ""} · {o.users} {o.users === 1 ? "user" : "users"}</Text>
                    </VStack>
                  </TableCell>
                  {competitions.map((c) => {
                    const row = cover.get(`${o.id}:${c.id}`);
                    const field = (change: string, label: string, variant: "secondary" | "ghost" = "ghost") => (
                      <ActionForm action={setCoverage}>
                        <input type="hidden" name="org" value={o.id} />
                        <input type="hidden" name="competition" value={c.id} />
                        <input type="hidden" name="change" value={change} />
                        <Submit label={label} size="sm" variant={variant} />
                      </ActionForm>
                    );
                    return (
                      <TableCell key={c.id}>
                        {row ? (
                          <VStack gap={1}>
                            <HStack gap={1} wrap="wrap">
                              <Token size="sm" color="green" label="Included" />
                              {row.owner && <Token size="sm" color="purple" label="Owner" />}
                            </HStack>
                            <HStack gap={1} wrap="wrap">
                              {field("remove", "Remove")}
                              {o.kind === "federation" && field(row.owner ? "not_owner" : "owner", row.owner ? "Not owner" : "Mark owner")}
                            </HStack>
                          </VStack>
                        ) : (
                          <VStack gap={1}>
                            <Text type="supporting">Not included</Text>
                            {field("grant", "Grant", "secondary")}
                          </VStack>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </VStack>
  );
}
