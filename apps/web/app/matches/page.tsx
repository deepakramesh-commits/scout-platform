import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe } from "@/lib/auth";
import { STAFF, type Status, type Task } from "@/lib/engine";
import { StatusToken } from "./status-token";

export const dynamic = "force-dynamic";

type Row = {
  id: string; status: Status; kickoff_at: Date | null; competition: string; home: string; away: string;
  tasks: Task[]; events: number; has_video: boolean; has_sheet: boolean;
};

const TOOLS: { label: string; path: string; for: Task[] }[] = [
  { label: "Match sheet", path: "sheet", for: ["coordinator"] },
  { label: "Video", path: "video", for: ["coordinator"] },
  { label: "Event log", path: "log", for: ["analyst"] },
  { label: "Import", path: "import", for: ["analyst"] },
  { label: "Sample log", path: "log?mode=review", for: ["reviewer"] },
  { label: "Quality check", path: "qc", for: ["analyst", "reviewer"] },
];

export default async function Matches() {
  const user = await requireMe(STAFF);
  const admin = user.role === "admin";
  const rows = await db((tx) => tx<Row[]>`
    select m.id, m.status, m.kickoff_at, c.name || ' ' || c.season as competition, h.name as home, a.name as away,
           coalesce((select array_agg(task order by task) from match_assignments x where x.match_id = m.id and x.user_id = ${user.id}), '{}') as tasks,
           (select count(*)::int from events e where e.match_id = m.id) as events,
           m.video_path is not null or m.mux_playback_id is not null as has_video,
           exists (select 1 from lineups l where l.match_id = m.id) as has_sheet
    from matches m join competitions c on c.id = m.competition_id
    join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id
    where ${admin} or exists (select 1 from match_assignments x where x.match_id = m.id and x.user_id = ${user.id})
    order by m.status = 'published', m.kickoff_at desc nulls last limit 200`);

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Matches</Heading>
        <Text color="secondary">
          Each match moves from uploaded to tagging, review and published. Only published matches feed player profiles. {admin ? "As an admin you see every match." : "These are the matches assigned to you."}
        </Text>
      </VStack>
      <Card padding={0}>
        {rows.length === 0 ? (
          <EmptyState title="No matches assigned to you" description="An admin assigns matches to coordinators and analysts. Ask yours to add you to the next one." />
        ) : (
          <Table density="balanced">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Match</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Progress</TableHeaderCell>
                <TableHeaderCell>Tools</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => {
                const tasks = new Set<Task>(admin ? ["coordinator", "analyst", "reviewer"] : m.tasks);
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <VStack gap={0.5}>
                        <Text weight="semibold">{m.home} v {m.away}</Text>
                        <Text type="supporting">{m.competition}{m.kickoff_at ? ` · ${m.kickoff_at.toISOString().slice(0, 10)}` : ""}</Text>
                      </VStack>
                    </TableCell>
                    <TableCell><StatusToken status={m.status} /></TableCell>
                    <TableCell>
                      <Text type="supporting">
                        {[m.has_sheet ? "Sheet in" : "No sheet", m.has_video ? "video in" : "no video", `${m.events} events`].join(" · ")}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <HStack gap={3} wrap="wrap">
                        {TOOLS.filter((t) => t.for.some((f) => tasks.has(f))).map((t) => (
                          <Link key={t.path} href={`/matches/${m.id}/${t.path}`}>{t.label}</Link>
                        ))}
                      </HStack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </VStack>
  );
}
