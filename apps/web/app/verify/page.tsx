import Form from "next/form";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Me, type Q } from "@/lib/auth";
import { ROLE_NAMES } from "@/lib/metrics";
import { CONTRACT_STATUS, type ContractStatus } from "@/lib/workflow";
import { ActionForm, Area, Check, Choice, Field, Submit } from "../forms";
import { PageHead, when } from "../page-kit";
import { Demo } from "../ui";
import { VerifiedMark } from "../verified";
import { saveVerification } from "./actions";
import { IdUpload } from "./id-upload";

export const dynamic = "force-dynamic";

type Row = { id: string; display_name: string; primary_position: string | null; id_verified: boolean; status: string; is_demo: boolean; checks: number | null };
type Detail = Row & {
  federation_registration: string | null; id_checked: boolean | null; photo_checked: boolean | null; contract_status: ContractStatus | null;
  note: string | null; verified_at: Date | null; verifier: string | null;
  legal_name: string | null; date_of_birth: string | null; id_document_path: string | null; has_identity: boolean;
};
type Params = { q?: string; show?: string; player?: string };

const SHOW = { unverified: "Not verified", verified: "Verified", all: "All" } as const;
const isShow = (v: string | undefined): v is keyof typeof SHOW => v !== undefined && v in SHOW;
const CONTRACT_OPTIONS = Object.entries(CONTRACT_STATUS).map(([value, label]) => ({ value, label }));

export default async function Verify({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireMe(["admin", "federation"]);
  const params = await searchParams;
  return db((tx) => VerifyPage(tx, user, params));
}

async function VerifyPage(tx: Q, user: Me, { q, show: rawShow, player }: Params) {
  const show = isShow(rawShow) ? rawShow : "unverified";
  const name = q?.trim() || null;
  // RLS lists the players this user may verify: everyone for an admin; for a federation, visible players and its competition's.
  const [rows, [counts], [detail]] = await Promise.all([
    tx<Row[]>`
      select p.id, p.display_name, p.primary_position, p.id_verified, p.status, p.is_demo,
             (v.id_checked::int + v.photo_checked::int + (coalesce(v.federation_registration, '') <> '')::int) as checks
      from players p left join verifications v on v.player_id = p.id
      where (${name}::text is null or p.display_name ilike '%' || ${name} || '%')
        and (${show} = 'all' or p.id_verified = (${show} = 'verified'))
      order by p.status <> 'pending_approval', coalesce(v.id_checked::int + v.photo_checked::int, 0) desc, p.display_name
      limit 60`,
    tx<{ verified: number; total: number }[]>`select count(*) filter (where id_verified)::int as verified, count(*)::int as total from players`,
    player
      ? tx<Detail[]>`
          select p.id, p.display_name, p.primary_position, p.id_verified, p.status, p.is_demo, null::int as checks,
                 v.federation_registration, v.id_checked, v.photo_checked, v.contract_status, v.note, v.verified_at, u.display_name as verifier,
                 pi.legal_name, to_char(pi.date_of_birth, 'YYYY-MM-DD') as date_of_birth, pi.id_document_path, pi.player_id is not null as has_identity
          from players p left join verifications v on v.player_id = p.id left join app_users u on u.id = v.verified_by
          left join player_identity pi on pi.player_id = p.id
          where p.id = ${player}`
      : Promise.resolve([] as Detail[]),
  ]);
  const href = (extra: Params) => `/verify?${new URLSearchParams(Object.entries({ q: name ?? undefined, show, ...extra }).filter((e): e is [string, string] => Boolean(e[1])))}`;

  return (
    <VStack gap={6}>
      <PageHead title="Verify players"
        intro={`A profile is verified when the federation registration, the ID and the photo are all checked. ${counts.verified} of ${counts.total} profiles you can see are verified. Legal names, dates of birth and ID documents are never shown to clubs.`} />
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={3}>
            <Form action="/verify">
              <HStack gap={2} vAlign="end" wrap="wrap">
                <Field label="Name" name="q" type="search" value={name ?? ""} placeholder="e.g. Mensah" width={200} />
                <Choice label="Show" name="show" options={Object.entries(SHOW).map(([value, label]) => ({ value, label }))} value={show} width={150} />
                <Button type="submit" label="Filter" variant="secondary" />
              </HStack>
            </Form>
            {rows.length === 0 ? <EmptyState isCompact title="No players match" description="Change the name or show all players." /> : (
              <Table density="compact">
                <TableHeader><TableRow><TableHeaderCell>Player</TableHeaderCell><TableHeaderCell>Checks</TableHeaderCell></TableRow></TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <VStack gap={0}>
                          <HStack gap={1} vAlign="center" wrap="wrap">
                            {r.id === player ? <Text weight="semibold">{r.display_name}</Text> : <Link href={href({ player: r.id })}>{r.display_name}</Link>}
                            <VerifiedMark verified={r.id_verified} />
                            {r.status === "pending_approval" && <Token size="sm" color="yellow" label="Awaiting approval" />}
                            {r.is_demo && <Demo />}
                          </HStack>
                          {r.primary_position && <Text type="supporting">{ROLE_NAMES[r.primary_position] ?? r.primary_position}</Text>}
                        </VStack>
                      </TableCell>
                      <TableCell><Text type="supporting" hasTabularNumbers>{r.checks ?? 0} of 3</Text></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {rows.length === 60 && <Text type="supporting">Showing the first 60. Search by name to find others.</Text>}
          </VStack>
        </Card>

        {detail ? <VerifyForm user={user} d={detail} /> : (
          <Card><EmptyState title="Choose a player" description="Pick a player on the left to record the federation registration, ID and photo checks and the contract status." /></Card>
        )}
      </Grid>
    </VStack>
  );
}

function VerifyForm({ user, d }: { user: Me; d: Detail }) {
  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>{d.display_name}</Heading>
            <VerifiedMark verified={d.id_verified} />
            {d.is_demo && <Demo />}
          </HStack>
          <Text type="supporting">
            {d.verified_at ? `Verified ${when(d.verified_at)}${d.verifier ? ` by ${d.verifier}` : ""}.` : "Not verified yet."} <Link href={`/players/${d.id}`}>Open profile</Link>
          </Text>
        </VStack>
        <ActionForm action={saveVerification} done="Saved.">
          <input type="hidden" name="player" value={d.id} />
          <VStack gap={3}>
            <Field label="Federation registration number" name="registration" value={d.federation_registration ?? ""} placeholder="e.g. GFA-2023-0412" />
            <Check label="ID document checked" name="idChecked" value={d.id_checked ?? false} description="Name and date of birth match an official ID" />
            <Check label="Photo checked" name="photoChecked" value={d.photo_checked ?? false} description="The profile photo is this player" />
            <Choice label="Contract status" name="contract" options={CONTRACT_OPTIONS} value={d.contract_status ?? "unknown"} width={220} />
            <Area label="Note" name="note" value={d.note ?? ""} rows={2} maxLength={1000} placeholder="Anything the next verifier should know" />
            <Heading level={4}>Identity (private)</Heading>
            <HStack gap={2} wrap="wrap">
              <Field label="Legal name" name="legalName" value={d.legal_name ?? ""} width={240} />
              <Field label="Date of birth" name="dateOfBirth" value={d.date_of_birth ?? ""} placeholder="YYYY-MM-DD" width={160} />
            </HStack>
            <HStack><Submit label="Save verification" /></HStack>
          </VStack>
        </ActionForm>
        {d.has_identity ? (
          <VStack gap={2}>
            <IdUpload playerId={d.id} />
            {d.id_document_path
              ? (user.role === "admin"
                  ? <Text type="supporting">ID document on file. <Link href={`/verify/id-document?player=${d.id}`} target="_blank">Open it</Link></Text>
                  : <Text type="supporting">ID document on file. Only our admins can open it.</Text>)
              : <Text type="supporting">No ID document uploaded yet.</Text>}
          </VStack>
        ) : <Text type="supporting">Save the legal name and date of birth to upload an ID document.</Text>}
      </VStack>
    </Card>
  );
}
