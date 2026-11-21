import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { StackItem } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db } from "@/lib/auth";
import { rolePlural } from "@/lib/metrics";
import { RECOMMENDATION_LABEL } from "@/lib/report-form";
import { scoutGroupAverages } from "@/lib/report";
import { getAttributes, getEvidence, getProfiles, getReports, pickProfile } from "@/lib/scouting";
import { LightTheme } from "../../shell";
import { Demo } from "../../ui";
import { MentalityChart } from "./eye-charts";
import { FitCard } from "./fit-card";
import { PlayerHeader } from "./header";
import { getPlayer } from "./player";
import { loadRiskMarket, MarketFacts, RISK_STATUS, TestsTable } from "./risk-market";
import { mentality } from "./scout-view";
import { StandoutQualities } from "./standouts";

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const GROUP_TITLE = { technical: "Technical", physical: "Physical", tactical: "Tactical", mental: "Mentality" } as const;

/**
 * Everything the scouting report shows, read as `viewer`: the signed-in scout, or for a shared link its creator, so the reader
 * sees exactly what the creator's organisation sees. Null when that viewer may not see the player.
 */
export async function loadReport(id: string, profileId: string | null, viewer: string) {
  return db(async (tx) => {
    const p = await getPlayer(tx, id);
    if (!p) return null;
    const [attributes, profiles, evidence, reports, [summary], [author], riskMarket] = await Promise.all([
      getAttributes(tx),
      getProfiles(tx),
      getEvidence(tx, [id]).then((m) => m.get(id)!),
      getReports(tx, id),
      tx<{ text: string; source: "template" | "claude" }[]>`
        select text, source from player_summaries where player_id = ${id} order by created_at desc limit 1`,
      tx<{ name: string | null; org: string | null }[]>`
        select u.display_name as name, o.name as org from app_users u left join orgs o on o.id = u.org_id where u.id = auth.uid()`,
      loadRiskMarket(tx, id, p.role == null ? { ...p, minutes: 0, competition_id: null } : p),
    ]);
    return { id, p, attributes, profiles, profile: pickProfile(profiles, profileId, p.role), evidence, reports, summary, author, ...riskMarket };
  }, viewer);
}

export type ReportData = NonNullable<Awaited<ReturnType<typeof loadReport>>>;

/** The report as one document. A light theme on screen as on paper, so print colours never depend on the dark app theme. */
export function ScoutingReport({ data, tools, footnote }: { data: ReportData; tools?: React.ReactNode; footnote: string }) {
  const { id, p, attributes, profile, evidence, reports, summary, author, risk, facts, tests } = data;
  const attrs = new Map(attributes.map((a) => [a.key, a]));
  const groups = scoutGroupAverages(attributes, evidence.evidence);
  const groupDemo = (g: string) => reports.some((r) => r.is_demo && attributes.some((a) => a.grp === g && r.ratings[a.key] != null));
  const mental = mentality(attributes, reports);
  const recs = (["sign", "follow", "pass"] as const).flatMap((k) => {
    const n = reports.filter((r) => r.recommendation === k).length;
    return n ? [`${RECOMMENDATION_LABEL[k]} ${n}`] : [];
  });
  const shownFacts = p.role == null ? facts.filter((f) => f.label !== "Foot in match data") : facts;

  return (
    <VStack gap={4}>
      {tools}
      <LightTheme>
        <VStack gap={4} className="report">
          <Card>
            <VStack gap={4}>
              <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                <Text type="label" color="secondary">Scouting report</Text>
                <Text type="supporting">
                  {date(new Date())}{author?.name ? ` · ${author.name}` : ""}{author?.org ? `, ${author.org}` : ""}
                </Text>
              </HStack>
              <PlayerHeader id={id} p={p} size={96} />
              {summary && (
                <VStack gap={1}>
                  <Text>{summary.text}</Text>
                  <Text type="supporting" size="xsm">{summary.source === "claude" ? "Summary drafted by Claude from the numbers below" : "Summary written from a template over the numbers below"}</Text>
                </VStack>
              )}
            </VStack>
          </Card>

          {p.role == null ? (
            <Card variant="muted">
              <EmptyState isCompact title="No published match data yet"
                description="Standout qualities, percentiles and match-based risk appear once a match he plays in is logged and passes the quality check." />
            </Card>
          ) : (
            <Card><StandoutQualities p={p} attrs={attrs} plural={rolePlural(p.role)} /></Card>
          )}

          {profile && <FitCard profile={profile} attributes={attrs} evidence={evidence} peers={p.role == null ? 0 : p.peers} role={p.role} />}

          <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={4} align="start">
            <Card>
              <VStack gap={3}>
                <VStack gap={1}>
                  <Heading level={2}>Scout ratings</Heading>
                  <Text type="supporting">
                    {reports.length
                      ? `${reports.length} ${reports.length === 1 ? "report" : "reports"} from ${author?.org ?? "the organisation"}${recs.length ? `: ${recs.join(", ")}` : ""}. Averages on the scouts' scale of 1 to 10.`
                      : `No reports from ${author?.org ?? "the organisation"} yet.`}
                  </Text>
                </VStack>
                {groups.map((g, i) => (
                  <VStack key={g.group} gap={2}>
                    <HStack gap={3} hAlign="between" vAlign="start">
                      <StackItem size="fill">
                        <VStack gap={0}>
                          <HStack gap={1} vAlign="center" wrap="wrap">
                            <Text weight="semibold">{GROUP_TITLE[g.group]}</Text>
                            {groupDemo(g.group) && <Demo />}
                          </HStack>
                          <Text type="supporting" size="xsm">
                            {g.rated.length ? g.rated.map((r) => `${r.label} ${r.value.toFixed(1)}`).join(" · ") : "Not rated"}
                          </Text>
                        </VStack>
                      </StackItem>
                      <Text weight="bold" hasTabularNumbers>{g.avg == null ? "–" : g.avg.toFixed(1)}</Text>
                    </HStack>
                    {i < groups.length - 1 && <Divider />}
                  </VStack>
                ))}
              </VStack>
            </Card>

            <Card>
              <VStack gap={3}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Heading level={2}>Mentality</Heading>
                  {mental.demo && <Demo />}
                </HStack>
                {mental.rows.some((m) => m.ratings.length)
                  ? <MentalityChart rows={mental.rows} />
                  : <Text type="supporting">No mentality ratings yet. They come only from scouts who saw him play, train or talk.</Text>}
              </VStack>
            </Card>
          </Grid>

          <Card>
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={2}>Risk</Heading>
                <Text type="supporting">Unknown means the data is missing, not that it is fine.</Text>
              </VStack>
              {risk.map((r, i) => (
                <VStack key={r.key} gap={2}>
                  <VStack gap={0}>
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <Text weight="semibold">{r.label}</Text>
                      <Token size="sm" label={RISK_STATUS[r.status].label} color={RISK_STATUS[r.status].color} />
                      {r.demo && <Demo />}
                    </HStack>
                    <Text type="supporting">{r.reason}</Text>
                  </VStack>
                  {i < risk.length - 1 && <Divider />}
                </VStack>
              ))}
            </VStack>
          </Card>

          <Grid columns={{ minWidth: 360, repeat: "fit" }} gap={4} align="start">
            <Card>
              <VStack gap={3}>
                <Heading level={2}>Market</Heading>
                <MarketFacts facts={shownFacts} />
              </VStack>
            </Card>
            <Card>
              <VStack gap={3}>
                <Heading level={2}>Physical tests</Heading>
                {tests.length ? <TestsTable tests={tests} /> : <Text type="supporting">No physical tests recorded.</Text>}
              </VStack>
            </Card>
          </Grid>

          <Card padding={3}><Text type="supporting" size="xsm">{footnote}</Text></Card>
        </VStack>
      </LightTheme>
    </VStack>
  );
}
