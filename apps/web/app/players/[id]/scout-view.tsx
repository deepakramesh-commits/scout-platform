import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, type Me } from "@/lib/auth";
import { attributeValue } from "@/lib/fit";
import { smallGroupNote } from "@/lib/metrics";
import { RECOMMENDATION_LABEL, REPORT_ROLES } from "@/lib/report-form";
import { getReports, GROUP_ORDER, SOURCE_LABEL, type Attribute, type PlayerEvidence, type ScoutReport } from "@/lib/scouting";
import { Demo, PctBadge } from "../../ui";
import { MentalityChart, NumbersBesideEye, type EyeRow, type MentalRow } from "./eye-charts";

const REC_COLOR = { sign: "green", follow: "teal", pass: "red" } as const;
const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Each mental attribute with every scout's rating and their average; demo when any of those ratings is. */
export function mentality(attributes: Attribute[], reports: ScoutReport[]): { rows: MentalRow[]; demo: boolean } {
  const who = (r: ScoutReport) => `${r.author ?? "A colleague"}, ${date(r.created_at)}`;
  const mental = attributes.filter((a) => a.grp === "mental");
  const rows = mental.map((a) => {
    const ratings = reports.filter((r) => r.ratings[a.key] != null).map((r) => ({ value: r.ratings[a.key], who: who(r) }));
    return { key: a.key, label: a.label, ratings, avg: mean(ratings.map((x) => x.value)) };
  });
  return { rows, demo: reports.some((r) => r.is_demo && mental.some((a) => r.ratings[a.key] != null)) };
}

export async function ScoutView({ id, user, attributes, evidence, peers, role }: {
  id: string; user: Me; attributes: Attribute[]; evidence: PlayerEvidence; peers: number; role: string | null;
}) {
  const reports = await db((tx) => getReports(tx, id));
  const canWrite = REPORT_ROLES.includes(user.role) && !!user.org_id;
  const small = role && smallGroupNote(peers, role);
  const ratedCount = (key: string) => reports.filter((r) => r.ratings[key] != null).length;
  const { rows: mental, demo: mentalDemo } = mentality(attributes, reports);
  const eye: EyeRow[] = attributes.flatMap((a) => {
    const ev = evidence.evidence[a.key];
    return ev?.match != null && ev.scout != null
      ? [{ key: a.key, label: a.label, match: ev.match, scout: ev.scout, demo: reports.some((r) => r.is_demo && r.ratings[a.key] != null) }]
      : [];
  });
  const write = canWrite && <Button variant="primary" label="Write a report" href={`/players/${id}/report`} />;

  return (
    <VStack gap={4}>
      <HStack gap={3} hAlign="between" vAlign="end" wrap="wrap">
        <VStack gap={1}>
          <Heading level={2}>Scout view</Heading>
          <Text color="secondary">
            {reports.length
              ? `${reports.length} ${reports.length === 1 ? "report" : "reports"} from ${user.org_name ?? "your organisation"}. Only its members read them.`
              : `No one at ${user.org_name ?? "your organisation"} has reported on him yet. Reports stay inside your organisation.`}
          </Text>
        </VStack>
        {write}
      </HStack>

      <Card>
        <VStack gap={4}>
          <VStack gap={1}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={3}>Personal profile and mentality</Heading>
              {mentalDemo && <Demo />}
            </HStack>
            <Text type="supporting">
              The eight qualities clubs ask about first and match data cannot show. Every rating comes from a scout who saw him play, train or talk.
            </Text>
          </VStack>
          {mental.some((m) => m.ratings.length)
            ? <MentalityChart rows={mental} />
            : <EmptyState isCompact title="No mentality ratings yet"
                description="Mental strength, work ethic, leadership and the rest come only from scout reports."
                actions={canWrite ? <Button label="Rate his mentality" href={`/players/${id}/report`} /> : undefined} />}
        </VStack>
      </Card>

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={3}>
            <VStack gap={1}>
              <Heading level={3}>Numbers beside the eye</Heading>
              <Text type="supporting">Each attribute that has both match data and a scout rating, so a disagreement shows.{small && ` Match percentiles are ${small}.`}</Text>
            </VStack>
            {eye.length
              ? <NumbersBesideEye rows={eye} />
              : <EmptyState isCompact title="Nothing to set side by side yet" description="This needs a scout rating on an attribute the match data also measures, such as passing or pressing." />}
          </VStack>
        </Card>

        <Card>
          <VStack gap={3}>
            <Heading level={3}>Reports</Heading>
            {reports.length === 0 && (
              <EmptyState isCompact title="No reports yet" description="Several scouts can report on one player; each report and their average show here." />
            )}
            {reports.map((r, i) => <Report key={r.id} r={r} mine={r.author_id === user.id} playerId={id} total={attributes.length} last={i === reports.length - 1} />)}
          </VStack>
        </Card>
      </Grid>

      <VStack gap={1}>
        <Heading level={3}>Every attribute</Heading>
        <Text type="supporting">Each attribute's source, the evidence behind it and the scouts' average. The badge averages match data, test and scout rating where they exist.</Text>
      </VStack>
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        {GROUP_ORDER.map((g) => (
          <Card key={g}>
            <VStack gap={3}>
              <Heading level={3}>{g.charAt(0).toUpperCase() + g.slice(1)}</Heading>
              {attributes.filter((a) => a.grp === g).map((a, i, all) => {
                const ev = evidence.evidence[a.key] ?? {};
                const n = ratedCount(a.key);
                const v = attributeValue(ev);
                return (
                  <VStack key={a.key} gap={2}>
                    <VStack gap={0}>
                      <HStack gap={2} hAlign="between" vAlign="center">
                        <Text weight="semibold">{a.label}</Text>
                        <PctBadge pct={v == null ? null : Math.round(v)} />
                      </HStack>
                      <Text type="supporting">{SOURCE_LABEL[a.source]} · {a.description}</Text>
                      <HStack gap={1} vAlign="center" wrap="wrap">
                        <Text type="supporting">
                          {[
                            ev.match != null && `Match percentile ${ev.match}`,
                            ev.test != null && `Test percentile ${ev.test}`,
                            ev.scout != null && `Scouts ${(ev.scout / 10).toFixed(1)} of 10 (${n} ${n === 1 ? "report" : "reports"})`,
                          ].filter(Boolean).join(" · ") || "No evidence yet"}
                        </Text>
                        {evidence.demo.has(a.key) && <Demo />}
                      </HStack>
                    </VStack>
                    {i < all.length - 1 && <Divider />}
                  </VStack>
                );
              })}
            </VStack>
          </Card>
        ))}
      </Grid>
    </VStack>
  );
}

function Report({ r, mine, playerId, total, last }: { r: ScoutReport; mine: boolean; playerId: string; total: number; last: boolean }) {
  const rated = Object.keys(r.ratings).length;
  const parts: [string, string][] = ([["Strengths", r.strengths], ["Weaknesses", r.weaknesses], ["Comments", r.comments]] as [string, string][]).filter(([, t]) => t);
  return (
    <VStack gap={2} id={`report-${r.id}`}>
      <HStack gap={2} wrap="wrap" vAlign="center" hAlign="between">
        <HStack gap={2} wrap="wrap" vAlign="center">
          <Token size="sm" color={REC_COLOR[r.recommendation]} label={RECOMMENDATION_LABEL[r.recommendation]} description="Recommendation" />
          <Text weight="semibold">{r.author ?? "A colleague"}</Text>
          <Text type="supporting">{date(r.created_at)}{r.updated_at.getTime() - r.created_at.getTime() > 60_000 ? `, edited ${date(r.updated_at)}` : ""}</Text>
          {r.is_demo && <Demo />}
        </HStack>
        {mine && <Button size="sm" variant="ghost" label="Edit" href={`/players/${playerId}/report?report=${r.id}`} />}
      </HStack>
      <Text type="supporting">Seen: {r.seen_in} · {rated} of {total} attributes rated</Text>
      {parts.map(([label, t]) => (
        <VStack key={label} gap={0}>
          <Text type="label" color="secondary">{label}</Text>
          <Text>{t}</Text>
        </VStack>
      ))}
      {!last && <Divider />}
    </VStack>
  );
}
