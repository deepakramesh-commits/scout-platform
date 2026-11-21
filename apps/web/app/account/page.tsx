import { redirect } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, me, type Me, type Q } from "@/lib/auth";
import { label, LOWER_IS_BETTER, ROLE_NAMES } from "@/lib/metrics";
import { ACCOUNT_TYPES } from "@/lib/signup";
import { ActionForm, Check, Submit } from "../forms";
import { when } from "../page-kit";
import { Demo, PctBadge } from "../ui";
import { VerifiedMark } from "../verified";
import { confirmAgent, withdrawConsent } from "./actions";

export const dynamic = "force-dynamic";

type Status = "live" | "pending_approval" | "declined" | "withdrawn";
type Mine = {
  id: string; display_name: string; status: Status; birth_year: number | null; id_verified: boolean; is_demo: boolean; approved_at: Date | null;
  views: number | null; decision_note: string | null; decided_at: Date | null;
  consent_id: string | null; signed_at: Date | null; revoked_at: Date | null; guardian_name: string | null; guardian_contact: string | null;
  agents: { org: string; name: string; confirmed: boolean }[];
};
type Claim = { id: string; status: "pending" | "approved" | "declined"; note: string; created_at: Date; decided_at: Date | null };
type Stat = { player_id: string; competition: string; role: string; minutes: number; percentiles: Record<string, number> };
type Cover = { name: string; season: string; owner: boolean; is_demo: boolean };

const STATUS: Record<Status, { label: string; color: "green" | "yellow" | "red" | "gray"; text: string }> = {
  live: { label: "Live", color: "green", text: "Clubs that subscribe to Scout can see this profile." },
  pending_approval: { label: "Waiting for approval", color: "yellow", text: "The player is under 18, so one of our admins approves the profile before clubs can see it. Nobody outside Scout sees it until then." },
  declined: { label: "Declined", color: "red", text: "Our admins did not approve this profile. Clubs cannot see it." },
  withdrawn: { label: "Consent withdrawn", color: "gray", text: "The profile is hidden from every club, and the player's personal data is queued for deletion." },
};
const CLAIM = { pending: "Waiting for an admin to check it is you", approved: "Approved: the profile is linked to your account", declined: "Declined" } as const;
const roleLabel = (role: string) => Object.values(ACCOUNT_TYPES).find((t) => t.role === role)?.label ?? (role === "admin" ? "Scout admin" : role);

export default async function Account({ searchParams }: { searchParams: Promise<{ inactive?: string; welcome?: string }> }) {
  const [user, { inactive, welcome }] = await Promise.all([me(), searchParams]);
  if (!user) redirect("/login");
  return db((tx) => AccountPage(tx, user, Boolean(inactive) || !user.active, Boolean(welcome)));
}

async function AccountPage(tx: Q, user: Me, inactive: boolean, welcome: boolean) {
  const personal = user.role === "player" || user.role === "guardian";
  const [mine, claims, stats, covers] = await Promise.all([
    personal ? tx<Mine[]>`
      select p.id, p.display_name, p.status, p.birth_year, p.id_verified, p.is_demo, p.approved_at, app.view_count(p.id) as views,
             a.note as decision_note, a.decided_at, c.id as consent_id, c.signed_at, c.revoked_at, c.guardian_name, c.guardian_contact,
             coalesce((select json_agg(json_build_object('org', o.id, 'name', o.name, 'confirmed', ac.confirmed_at is not null) order by o.name)
                       from agent_clients ac join orgs o on o.id = ac.org_id where ac.player_id = p.id), '[]') as agents
      from players p
      left join lateral (select note, decided_at from approvals where player_id = p.id order by decided_at desc limit 1) a on true
      left join lateral (select * from consents where player_id = p.id order by signed_at desc limit 1) c on true
      where p.claimed_by = ${user.id} or p.guardian_id = ${user.id} order by p.display_name` : Promise.resolve([] as Mine[]),
    personal ? tx<Claim[]>`select id, status, note, created_at, decided_at from profile_claims where user_id = ${user.id} order by created_at desc` : Promise.resolve([] as Claim[]),
    personal ? tx<Stat[]>`
      select m.player_id, c.name || ' ' || c.season as competition, m.role, m.minutes, m.percentiles
      from player_season_metrics m join competitions c on c.id = m.competition_id join players p on p.id = m.player_id
      where (p.claimed_by = ${user.id} or p.guardian_id = ${user.id}) and p.status = 'live' order by m.minutes desc` : Promise.resolve([] as Stat[]),
    user.org_id ? tx<Cover[]>`
      select c.name, c.season, oc.owner, c.is_demo from org_coverage oc join competitions c on c.id = oc.competition_id
      where oc.org_id = ${user.org_id} order by c.season desc, c.name` : Promise.resolve([] as Cover[]),
  ]);
  const staff = ["admin", "tagger", "coordinator"].includes(user.role);

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>{user.display_name ?? user.email}</Heading>
        <Text color="secondary">{roleLabel(user.role)}{user.org_name ? ` · ${user.org_name}` : ""} · {user.email}</Text>
      </VStack>
      {inactive && <Banner status="warning" title="Your account is waiting for one of our admins to switch it on" description="Staff accounts are never switched on automatically. You can sign in, but nothing else opens until then." collapsible={false} />}
      {welcome && !inactive && <Banner status="success" title="Your account is ready" collapsible={false} />}

      {!personal && (
        <Card>
          <VStack gap={2}>
            <Heading level={3}>Competitions in your plan</Heading>
            {staff ? <Text type="supporting">As Scout staff you see every competition.</Text>
              : covers.length === 0 ? <Text type="supporting">None yet. A subscription unlocks competitions; one of our admins adds them to your organisation.</Text>
              : (
                <HStack gap={2} wrap="wrap">
                  {covers.map((c) => (
                    <HStack key={`${c.name}${c.season}`} gap={1} vAlign="center">
                      <Token color="green" label={`${c.name} ${c.season}`} />
                      {c.owner && <Token color="purple" label="Your competition" />}
                      {c.is_demo && <Demo />}
                    </HStack>
                  ))}
                </HStack>
              )}
            {!staff && <Link href="/competitions">See all competitions</Link>}
          </VStack>
        </Card>
      )}

      {personal && mine.length === 0 && claims.length === 0 && (
        <Card><Text>No profile is linked to this account yet.</Text></Card>
      )}

      {mine.map((p) => {
        const s = STATUS[p.status];
        const own = stats.filter((x) => x.player_id === p.id);
        return (
          <Card key={p.id}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={2}>{p.display_name}</Heading>
                <Token color={s.color} label={s.label} />
                <VerifiedMark verified={p.id_verified} />
                {p.is_demo && <Demo />}
              </HStack>
              <VStack gap={1}>
                <Text>{s.text}</Text>
                {p.status === "declined" && p.decision_note && <Banner status="error" title="Note from our admin" description={p.decision_note} collapsible={false} />}
                {p.status === "live" && p.approved_at && <Text type="supporting">Approved {when(p.approved_at)}.</Text>}
              </VStack>
              <Grid columns={{ minWidth: 240, repeat: "fit" }} gap={4} align="start">
                <Card variant="muted" padding={4}>
                  <VStack gap={1}>
                    <Text type="label">Clubs that viewed this profile</Text>
                    <Heading level={2}>{p.views ?? 0}</Heading>
                    <Text type="supporting">Counted once per club or agency. Who viewed stays private.</Text>
                  </VStack>
                </Card>
                <Card variant="muted" padding={4}>
                  <VStack gap={1}>
                    <Text type="label">Consent</Text>
                    {!p.consent_id ? <Text>No consent on record.</Text> : (
                      <>
                        <Text>{p.revoked_at ? `Withdrawn ${when(p.revoked_at)}` : `Given ${when(p.signed_at!)} to share the profile with clubs`}</Text>
                        {p.guardian_name && <Text type="supporting">Parent or guardian: {p.guardian_name}{p.guardian_contact ? `, ${p.guardian_contact}` : ""}</Text>}
                      </>
                    )}
                  </VStack>
                </Card>
              </Grid>
              {p.status === "live" && (
                <VStack gap={2}>
                  <Heading level={3}>{user.role === "guardian" ? "Statistics" : "Your statistics"}</Heading>
                  {own.length === 0 ? <Text type="supporting">No statistics yet. They appear once a match you played in is published.</Text> : own.map((x) => {
                    const top = Object.entries(x.percentiles).filter(([k]) => !LOWER_IS_BETTER.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 3);
                    return (
                      <VStack key={`${x.competition}${x.role}`} gap={1}>
                        <Text weight="semibold">{x.competition} · {ROLE_NAMES[x.role] ?? x.role} · {x.minutes} minutes</Text>
                        {top.length === 0 ? <Text type="supporting">Too few minutes to rank against other {ROLE_NAMES[x.role]?.toLowerCase() ?? "player"}s.</Text> : (
                          <HStack gap={3} wrap="wrap">
                            {top.map(([k, pct]) => <HStack key={k} gap={1} vAlign="center"><PctBadge pct={pct} /><Text type="supporting">{label(k)} percentile</Text></HStack>)}
                          </HStack>
                        )}
                      </VStack>
                    );
                  })}
                </VStack>
              )}
              {p.consent_id && !p.revoked_at && (
                <Card variant="muted" padding={4}>
                  <ActionForm action={withdrawConsent}>
                    <input type="hidden" name="consent" value={p.consent_id} />
                    <Heading level={3}>Withdraw consent</Heading>
                    <Text type="supporting">The profile disappears from every club at once and the player's personal data is queued for deletion. To appear again you would sign up again.</Text>
                    <Check label="I understand and want to withdraw consent" name="confirm" />
                    <HStack><Submit label="Withdraw consent" variant="destructive" /></HStack>
                  </ActionForm>
                </Card>
              )}
              {p.agents.length > 0 && (
                <Card variant="muted" padding={4}>
                  <VStack gap={2}>
                    <Heading level={3}>Agents</Heading>
                    <Text type="supporting">An agency you confirm can edit this profile's details and market facts. Confirm only the agency that represents {user.role === "guardian" ? "the player" : "you"}.</Text>
                    {p.agents.map((a) => (
                      <HStack key={a.org} gap={2} vAlign="center" wrap="wrap">
                        <Text>{a.name}</Text>
                        {a.confirmed ? <Token color="green" label="Confirmed" /> : (
                          <ActionForm action={confirmAgent}>
                            <input type="hidden" name="player" value={p.id} />
                            <input type="hidden" name="org" value={a.org} />
                            <HStack><Submit label="Confirm this agency" size="sm" variant="secondary" /></HStack>
                          </ActionForm>
                        )}
                      </HStack>
                    ))}
                  </VStack>
                </Card>
              )}
            </VStack>
          </Card>
        );
      })}

      {claims.length > 0 && (
        <Card>
          <VStack gap={2}>
            <Heading level={3}>Profile claims</Heading>
            {claims.map((c) => (
              <VStack key={c.id} gap={0}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Token color={c.status === "approved" ? "green" : c.status === "declined" ? "red" : "yellow"} label={CLAIM[c.status]} />
                  <Text type="supporting">claimed {when(c.created_at)}</Text>
                </HStack>
                {c.note && <Text type="supporting">Note from our admin: {c.note}</Text>}
              </VStack>
            ))}
          </VStack>
        </Card>
      )}
    </VStack>
  );
}
