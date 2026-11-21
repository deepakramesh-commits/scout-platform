import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { StackItem } from "@astryxdesign/core/Stack";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting, type Q } from "@/lib/auth";
import { fitScore, PRIORITY_LABEL, standouts, type Fit } from "@/lib/fit";
import { ROLE_NAMES } from "@/lib/metrics";
import { latestTeam } from "@/lib/queries";
import { ageRange, draftLabel, getAttributes, getEvidence, getProfiles, SEASON_YEAR, type Profile } from "@/lib/scouting";
import { ProfilePicker } from "../profile-picker";
import { VerifiedMark } from "../verified";
import { Demo, flag, PlayerAvatar, PRIORITY_COLOR, Standouts } from "../ui";

export const dynamic = "force-dynamic";

type Candidate = {
  id: string; display_name: string; photo_url: string | null; team: string | null; role: string; minutes: number;
  peers: number; attr_percentiles: Record<string, number>; birth_year: number | null; age_is_demo: boolean; id_verified: boolean;
};
type Ranked = Candidate & { fit: Fit; demo: boolean };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const candidates = (tx: Q, p: Profile) => tx<Candidate[]>`
  select p.id, p.display_name, p.photo_url, lt.team, m.role, m.minutes, m.peers, m.attr_percentiles, p.birth_year,
         'birth_year' = any(p.demo_fields) as age_is_demo, p.id_verified
  from players p
  join lateral (select * from player_season_metrics m where m.player_id = p.id order by m.minutes desc limit 1) m on true
  ${latestTeam(tx)}
  where p.visible_to_scouts and m.role = any(${p.positions}::text[])
    and (${p.age_min}::int is null or ${SEASON_YEAR} - p.birth_year >= ${p.age_min})
    and (${p.age_max}::int is null or ${SEASON_YEAR} - p.birth_year <= ${p.age_max})`;

export default async function FindByRole(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireScouting();
  return db((tx) => FindByRolePage(tx, props));
}

async function FindByRolePage(tx: Q, { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const [profiles, attributes] = await Promise.all([getProfiles(tx), getAttributes(tx)]);
  const labels = Object.fromEntries(attributes.map((a) => [a.key, a.label]));

  if (!profiles.length) {
    return (
      <VStack gap={6}>
        <Heading level={1}>Find by role</Heading>
        <Card>
          <EmptyState title="No requirement profiles yet" description="Write the profile of the player you need, then rank every player against it."
            actions={<Button variant="primary" label="Write a profile" href="/profiles" />} />
        </Card>
      </VStack>
    );
  }

  const profile = profiles.find((p) => p.id === first(q.profile)) ?? profiles[0];
  const pool = await candidates(tx, profile);
  const evidence = await getEvidence(tx, pool.map((c) => c.id));
  const ranked: Ranked[] = pool.map((c) => {
    const pe = evidence.get(c.id)!;
    return { ...c, fit: fitScore(profile.items, pe.evidence), demo: profile.items.some((i) => pe.demo.has(i.attribute)) };
  });
  const byScore = (a: Ranked, b: Ranked) => (b.fit.score ?? 0) - (a.fit.score ?? 0) || b.fit.coverage - a.fit.coverage || b.minutes - a.minutes;
  const scored = ranked.filter((r) => r.fit.score != null).sort(byScore);
  const thin = ranked.filter((r) => r.fit.score == null).sort((a, b) => b.fit.coverage - a.fit.coverage || b.minutes - a.minutes);
  const draft = draftLabel(profile);
  const ages = ageRange(profile);

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Find by role</Heading>
        <Text color="secondary">Start from what the club needs. Every player in the profile’s positions, ranked by how well his evidence fits it.</Text>
      </VStack>

      <Card>
        <VStack gap={4}>
          <HStack gap={3} wrap="wrap" vAlign="end" hAlign="between">
            <StackItem size="fill">
              <ProfilePicker key={profile.id} action="/roles" name="profile" value={profile.id}
                options={profiles.map((p) => ({ value: p.id, label: p.name, description: p.club ?? undefined }))} />
            </StackItem>
            <Button variant="ghost" label="Write your own profile" href="/profiles" />
          </HStack>
          <VStack gap={2}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Heading level={2}>{profile.name}</Heading>
              {draft && <Token label={draft} color="yellow" />}
            </HStack>
            <Text color="secondary">
              {[profile.club, profile.positions.map((r) => ROLE_NAMES[r] ?? r).join(", "), ages].filter(Boolean).join(" · ")}
            </Text>
            {profile.note && <Text type="supporting">{profile.note}</Text>}
            <HStack gap={1} wrap="wrap">
              {profile.items.map((i) => (
                <Token key={i.attribute} size="sm" color={PRIORITY_COLOR[i.priority]}
                  label={`${labels[i.attribute] ?? i.attribute} · ${PRIORITY_LABEL[i.priority]}`} />
              ))}
            </HStack>
          </VStack>
        </VStack>
      </Card>

      {ranked.length === 0 ? (
        <Card>
          <EmptyState title="No players in these positions" description={`No visible player plays mainly as ${profile.positions.map((r) => (ROLE_NAMES[r] ?? r).toLowerCase()).join(" or ")}${ages ? `, ${ages}` : ""}. Widen the age range or the positions in a new profile.`}
            actions={<Button label="Write a profile" href="/profiles" />} />
        </Card>
      ) : (
        <>
          <Card>
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                <Heading level={3}>Ranked by fit</Heading>
                <Text type="supporting">{scored.length} of {ranked.length} players have enough evidence for a score</Text>
              </HStack>
              <FitTable rows={scored} labels={labels} empty="No player has enough evidence for this profile yet." />
            </VStack>
          </Card>
          {thin.length > 0 && (
            <Card variant="muted">
              <VStack gap={4}>
                <VStack gap={1}>
                  <Heading level={3}>Not enough evidence</Heading>
                  <Text type="supporting">Less than half of the weighted profile is measured for these players, so they get no score. More minutes, a physical test or a scout report would change that.</Text>
                </VStack>
                <FitTable rows={thin} labels={labels} empty="" />
              </VStack>
            </Card>
          )}
          <Text type="supporting">
            Fit averages the evidence for each attribute (match percentile within the position, physical test percentile among tested players,
            your organisation’s average scout rating × 10), weighted very high 3, high 2, medium 1. A Demo mark means some of the evidence comes from demo tests or demo reports.
          </Text>
        </>
      )}
    </VStack>
  );
}

function FitTable({ rows, labels, empty }: { rows: Ranked[]; labels: Record<string, string>; empty: string }) {
  return (
    <Table density="compact" hasHover style={{ minWidth: "44rem" }}>
      <TableHeader>
        <TableRow>
          <TableHeaderCell style={{ width: "4%" }}>#</TableHeaderCell>
          <TableHeaderCell style={{ width: "12%" }}>Fit</TableHeaderCell>
          <TableHeaderCell style={{ width: "34%" }}>Player</TableHeaderCell>
          <TableHeaderCell>Coverage</TableHeaderCell>
          <TableHeaderCell>Standout qualities</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={r.id} className={i < 10 ? "in" : undefined} style={i < 10 ? ({ "--i": i } as React.CSSProperties) : undefined}>
            <TableCell><Text type="supporting" hasTabularNumbers>{i + 1}</Text></TableCell>
            <TableCell>
              <VStack gap={1} hAlign="start">
                <Text weight="bold" hasTabularNumbers>{r.fit.score ?? "–"}</Text>
                {r.demo && <Demo />}
              </VStack>
            </TableCell>
            <TableCell>
              <Link href={`/players/${r.id}`}>
                <HStack gap={2} vAlign="center">
                  <PlayerAvatar name={r.display_name} photo={r.photo_url} />
                  <VStack gap={0}>
                    <HStack gap={1} vAlign="center" wrap="wrap"><Text weight="semibold">{r.display_name}</Text><VerifiedMark verified={r.id_verified} /></HStack>
                    <HStack gap={1} vAlign="center" wrap="wrap">
                      <Text type="supporting">{flag(r.team)} {r.team} · {r.role} · {r.birth_year == null ? "age not recorded" : `${SEASON_YEAR - r.birth_year} yrs`}</Text>
                      {r.birth_year != null && r.age_is_demo && <Demo />}
                    </HStack>
                  </VStack>
                </HStack>
              </Link>
            </TableCell>
            <TableCell><Text type="supporting" hasTabularNumbers>{r.fit.measured} of {r.fit.total} measured</Text></TableCell>
            <TableCell><Standouts keys={standouts(r.attr_percentiles)} labels={labels} peers={r.peers} role={r.role} /></TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && empty && (
          <TableRow><TableCell colSpan={5}><Text type="supporting">{empty}</Text></TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );
}
