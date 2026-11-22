import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db } from "@/lib/auth";
import { clock, exportDir, loadTool, matchPlayers } from "@/lib/engine";
import { SPEC_BY_TYPE } from "@/lib/event-spec";
import { qualityCheck, ruleFlags, type QcEvent, type Sample, type SheetEvent, type SheetLine } from "@/lib/qc";
import { MatchHeader } from "../match-header";
import { ActionButton, SampleForm } from "./controls";
import { readSettings } from "./data";

export const dynamic = "force-dynamic";

type Run = { run_at: Date; agreement: number; passed: boolean; primary_count: number; review_count: number; agreed: number; flags: number; reviewer: string | null };
type Accuracy = { name: string | null; runs: number; mean: number; last: Date };
type Job = { status: string; last_error: string | null };

const pct = (n: number) => `${Math.round(n * 100)}%`;

async function exportFiles(matchId: string): Promise<string[]> {
  const root = exportDir(matchId);
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])));
    return nested.flat();
  };
  return (await walk(root)).map((f) => relative(root, f)).sort();
}

export default async function QcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, match, tasks } = await loadTool(id, ["analyst", "reviewer"]);
  const canAct = tasks.has("reviewer");
  const data = await db(async (tx) => {
    const ev = (table: "events" | "review_events") => tx<QcEvent[]>`
      select id, player_id, team_id, period, video_seconds::float8 as video_seconds, type, x::float8 as x, y::float8 as y
      from ${tx(table)} where match_id = ${id} order by video_seconds`;
    const [settings, primary, review, players, lineups, sheet, [sample], runs, accuracy, [job]] = await Promise.all([
      readSettings(tx), ev("events"), ev("review_events"), matchPlayers(tx, match),
      tx<SheetLine[]>`select player_id, team_id, started from lineups where match_id = ${id}`,
      tx<SheetEvent[]>`select kind, minute, player_id, player_in_id, team_id from match_sheet_events where match_id = ${id}`,
      tx<Sample[]>`select period, start_seconds::float8 as start, end_seconds::float8 as end from qc_samples where match_id = ${id}`,
      tx<Run[]>`select r.run_at, r.agreement::float8 as agreement, r.passed, r.primary_count, r.review_count, r.agreed, r.flags, u.display_name as reviewer
                from qc_runs r left join app_users u on u.id = r.reviewer_id where r.match_id = ${id} order by r.run_at desc limit 10`,
      tx<Accuracy[]>`select u.display_name as name, count(*)::int as runs, avg(r.agreement)::float8 as mean, max(r.run_at) as last
                     from qc_runs r left join app_users u on u.id = r.analyst_id where r.analyst_id is not null
                     group by u.display_name order by mean desc`,
      tx<Job[]>`select status, last_error from jobs where kind = 'export_match' and payload->>'match_id' = ${id} order by id desc limit 1`,
    ]);
    return { settings, primary, review, players, lineups, sheet, sample, runs, accuracy, job };
  });
  const { settings, primary, review, players, sample, runs, accuracy, job } = data;
  const flags = ruleFlags(primary, match.periods, data.lineups, data.sheet);
  const live = sample ? qualityCheck(primary, review, sample, settings) : null;
  const latest = runs[0];
  const files = await exportFiles(id);

  const who = new Map(players.map((p) => [p.player_id, `${p.shirt_number ?? "?"} ${p.display_name}`]));
  const byId = new Map([...primary, ...review].map((e) => [e.id, e]));
  const describe = (e: QcEvent) => `${clock(e.video_seconds)} · ${SPEC_BY_TYPE[e.type]?.label ?? e.type} · ${e.player_id ? who.get(e.player_id) ?? "unknown player" : "no player"}`;
  const paired = new Set(live?.pairs.flat() ?? []);
  const inSample = (e: QcEvent) => sample && e.period === sample.period && e.video_seconds >= sample.start && e.video_seconds <= sample.end;
  const far = (live?.pairs ?? []).map(([a, b]) => [byId.get(a)!, byId.get(b)!] as const).filter(([a, b]) =>
    a.x == null || b.x == null ? a.x !== b.x : Math.hypot(a.x - b.x!, a.y! - b.y!) > settings.locationTolerance);
  const unmatched = [
    ...primary.filter((e) => inSample(e) && !paired.has(e.id)).map((e) => ({ e, side: "Only the analyst" })),
    ...review.filter((e) => inSample(e) && !paired.has(e.id)).map((e) => ({ e, side: "Only the reviewer" })),
  ].sort((a, b) => a.e.video_seconds - b.e.video_seconds);
  const firstPeriod = match.periods.find((p) => p.period === 1);
  const defaultSample = sample
    ? { period: sample.period, start: sample.start, minutes: Math.round((sample.end - sample.start) / 60) }
    : { period: 1, start: firstPeriod?.start ?? 0,
        minutes: firstPeriod ? Math.max(1, Math.min(settings.sampleMinutes, Math.floor((firstPeriod.end - firstPeriod.start) / 60))) : settings.sampleMinutes };

  return (
    <VStack gap={5}>
      <MatchHeader match={match} tool="Quality check"
        intro={`Rule flags first, then a second analyst logs a sample again. A match publishes when ${pct(settings.countAgreement)} of the sample's events agree: same type and player within ${settings.timeWindow} s, located within ${settings.locationTolerance} pitch units.`} />

      <Card>
        <VStack gap={3}>
          <Heading level={2}>Result</Heading>
          {latest ? (
            <HStack gap={3} vAlign="center" wrap="wrap">
              <Token label={latest.passed ? "Passed" : "Not passed"} color={latest.passed ? "green" : "red"} />
              <Text weight="semibold">{pct(latest.agreement)} agreement</Text>
              <Text type="supporting">{latest.agreed} agreeing of {Math.max(latest.primary_count, latest.review_count)} · analyst {latest.primary_count}, reviewer {latest.review_count} events in the sample · {latest.flags} rule flags · {latest.run_at.toISOString().slice(0, 16).replace("T", " ")}</Text>
            </HStack>
          ) : <Text color="secondary">No quality check has run yet.</Text>}
          {match.status === "published" ? (
            <Banner status="success" title="Published" description="This match feeds player profiles. Its events can no longer change." />
          ) : canAct ? (
            <HStack gap={3} wrap="wrap" vAlign="start">
              <ActionButton matchId={id} kind="run" label="Run the quality check" isDisabled={!sample} why="Choose the sample window first" />
              <ActionButton matchId={id} kind="publish" label="Publish" variant="primary" isDisabled={!latest?.passed}
                why="The latest quality check must pass before the match can publish" />
            </HStack>
          ) : <Text type="supporting">The reviewer runs the check and publishes.</Text>}
        </VStack>
      </Card>

      <Grid columns={{ minWidth: 420, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={3}>
            <Heading level={2}>Sample window</Heading>
            <Text type="supporting">The reviewer logs this part of the video again in the <Link href={`/matches/${id}/log?mode=review`}>sample log</Link>. Default length {settings.sampleMinutes} minutes.</Text>
            {sample && <Text>Period {sample.period}, {clock(sample.start)} to {clock(sample.end)} in the video</Text>}
            {canAct && match.status !== "published" && <SampleForm matchId={id} initial={defaultSample} periods={match.periods.map((p) => p.period)} />}
          </VStack>
        </Card>
        <Card padding={0}>
          <VStack gap={1} padding={4}>
            <Heading level={2}>Agreement by event type</Heading>
            <Text type="supporting">{live ? `Now: ${pct(live.agreement)}, ${live.agreed} of ${Math.max(live.primaryCount, live.reviewCount)} agree` : "Shown once a sample window is chosen."}</Text>
          </VStack>
          {live && Object.keys(live.byType).length > 0 && (
            <Table density="compact">
              <TableHeader><TableRow><TableHeaderCell>Type</TableHeaderCell><TableHeaderCell>Analyst</TableHeaderCell><TableHeaderCell>Reviewer</TableHeaderCell><TableHeaderCell>Agree</TableHeaderCell></TableRow></TableHeader>
              <TableBody>
                {Object.entries(live.byType).sort((a, b) => b[1].primary - a[1].primary).map(([t, c]) => (
                  <TableRow key={t}><TableCell>{SPEC_BY_TYPE[t]?.label ?? t}</TableCell><TableCell>{c.primary}</TableCell><TableCell>{c.review}</TableCell><TableCell>{c.agreed}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </Grid>

      {live && (unmatched.length > 0 || far.length > 0) && (
        <Card padding={0}>
          <VStack gap={1} padding={4}>
            <Heading level={2}>Events that do not agree</Heading>
            <Text type="supporting">Logged by one analyst only, or paired but placed more than {settings.locationTolerance} units apart.</Text>
          </VStack>
          <Table density="compact">
            <TableHeader><TableRow><TableHeaderCell>Event</TableHeaderCell><TableHeaderCell>Why</TableHeaderCell><TableHeaderCell>Video</TableHeaderCell></TableRow></TableHeader>
            <TableBody>
              {unmatched.map(({ e, side }) => (
                <TableRow key={e.id}><TableCell>{describe(e)}</TableCell><TableCell>{side}</TableCell>
                  <TableCell><Link href={`/matches/${id}/log?t=${Math.max(0, e.video_seconds - 5)}`}>Open at {clock(e.video_seconds)}</Link></TableCell></TableRow>
              ))}
              {far.map(([a, b]) => (
                <TableRow key={a.id}><TableCell>{describe(a)}</TableCell>
                  <TableCell>{a.x == null || b.x == null ? "Only one has a location" : `${Math.round(Math.hypot(a.x - b.x!, a.y! - b.y!))} units apart`}</TableCell>
                  <TableCell><Link href={`/matches/${id}/log?t=${Math.max(0, a.video_seconds - 5)}`}>Open at {clock(a.video_seconds)}</Link></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card padding={0}>
        <VStack gap={1} padding={4}>
          <Heading level={2}>Rule flags</Heading>
          <Text type="supporting">
            {flags.length === 0
              ? `No event breaks a rule (${primary.length} checked against the match sheet${match.periods.length ? " and the marked periods" : "; mark the periods to check playing time"}).`
              : `${flags.length} of ${primary.length} events break a rule. Fix them in the event log before publishing.`}
          </Text>
        </VStack>
        {flags.length > 0 && (
          <Table density="compact">
            <TableHeader><TableRow><TableHeaderCell>Event</TableHeaderCell><TableHeaderCell>Problem</TableHeaderCell><TableHeaderCell>Video</TableHeaderCell></TableRow></TableHeader>
            <TableBody>
              {flags.slice(0, 200).map((f) => {
                const e = byId.get(f.event_id)!;
                return (
                  <TableRow key={`${f.event_id}${f.rule}`}><TableCell>{describe(e)}</TableCell><TableCell>{f.message}</TableCell>
                    <TableCell><Link href={`/matches/${id}/log?t=${Math.max(0, e.video_seconds - 5)}`}>Open at {clock(e.video_seconds)}</Link></TableCell></TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Grid columns={{ minWidth: 420, repeat: "fit" }} gap={4} align="start">
        <Card padding={0}>
          <VStack gap={1} padding={4}>
            <Heading level={2}>Analyst accuracy</Heading>
            <Text type="supporting">{user.role === "admin" ? "Mean agreement over every quality check of each analyst's matches." : "Mean agreement over the quality checks of the matches you work on, and all of your own."}</Text>
          </VStack>
          {accuracy.length === 0 ? <VStack padding={4}><Text color="secondary">No checks have run yet.</Text></VStack> : (
            <Table density="compact">
              <TableHeader><TableRow><TableHeaderCell>Analyst</TableHeaderCell><TableHeaderCell>Checks</TableHeaderCell><TableHeaderCell>Mean agreement</TableHeaderCell></TableRow></TableHeader>
              <TableBody>
                {accuracy.map((a) => <TableRow key={a.name ?? "?"}><TableCell>{a.name ?? "Unknown"}</TableCell><TableCell>{a.runs}</TableCell><TableCell>{pct(a.mean)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card>
          <VStack gap={3}>
            <Heading level={2}>StatsBomb export</Heading>
            <Text type="supporting">The worker writes the match as StatsBomb-style JSON, which kloppy and socceraction read unchanged.</Text>
            {job && <Text type="supporting">Last export job: {job.status}{job.last_error ? `, ${job.last_error.split("\n")[0]}` : ""}</Text>}
            {files.length > 0 ? (
              <VStack gap={1}>
                {files.map((f) => <Link key={f} href={`/api/export/${id}/${f}`}>{f}</Link>)}
              </VStack>
            ) : <Text color="secondary">No export yet.</Text>}
            {canAct ? <ActionButton matchId={id} kind="export" label="Download StatsBomb JSON" />
              : <Text type="supporting">The reviewer exports the match.</Text>}
          </VStack>
        </Card>
      </Grid>

      {runs.length > 1 && (
        <Card padding={0}>
          <VStack padding={4}><Heading level={2}>Earlier checks</Heading></VStack>
          <Table density="compact">
            <TableHeader><TableRow><TableHeaderCell>When</TableHeaderCell><TableHeaderCell>Agreement</TableHeaderCell><TableHeaderCell>Result</TableHeaderCell><TableHeaderCell>Reviewer</TableHeaderCell></TableRow></TableHeader>
            <TableBody>
              {runs.map((r, i) => (
                <TableRow key={i}><TableCell>{r.run_at.toISOString().slice(0, 16).replace("T", " ")}</TableCell><TableCell>{pct(r.agreement)}</TableCell>
                  <TableCell>{r.passed ? "Passed" : "Not passed"}</TableCell><TableCell>{r.reviewer ?? "Unknown"}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </VStack>
  );
}
