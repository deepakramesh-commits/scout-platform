import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { db } from "@/lib/auth";
import { loadTool, matchPlayers } from "@/lib/engine";
import type { Sample } from "@/lib/qc";
import { CLIP_AFTER, CLIP_BEFORE, playbackUrl } from "@/lib/video";
import { MatchHeader } from "../match-header";
import { LogTool, type Logged } from "./log-tool";

export const dynamic = "force-dynamic";

export default async function LogPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string; t?: string }> }) {
  const [{ id }, { mode: asked, t }] = await Promise.all([params, searchParams]);
  const { user, match, tasks } = await loadTool(id, ["analyst", "reviewer"]);
  // The analyst logs the match; the reviewer re-logs the sample. An admin may do either and picks with ?mode=review.
  const mode = tasks.has("reviewer") && (asked === "review" || !tasks.has("analyst")) ? "review" : "events";
  const table = mode === "review" ? "review_events" : "events";
  const [players, initial, [sample]] = await db((tx) => Promise.all([
    matchPlayers(tx, match),
    tx<Logged[]>`
      select id, player_id, team_id, period, video_seconds::float8 as video_seconds, type, outcome, x::float8 as x, y::float8 as y,
             end_x::float8 as end_x, end_y::float8 as end_y, body_part, extra
      from ${tx(table)} where match_id = ${id} and (${mode === "events"} or tagger_id = ${user.id})
      order by created_at desc, video_seconds desc limit 200`,
    tx<Sample[]>`select period, start_seconds::float8 as start, end_seconds::float8 as end from qc_samples where match_id = ${id}`,
  ]));
  return (
    <VStack gap={4}>
      <MatchHeader match={match} tool={mode === "review" ? "Sample log" : "Event log"}
        intro={mode === "review"
          ? "Log the sample window again, independently. The quality check compares your events with the analyst's."
          : "Each event saves the moment you place it on the pitch, with the video time, so every number links to its clip."} />
      {mode === "review" && !sample ? (
        <Banner status="warning" title="No sample window yet" description="Choose the sample on the quality check page first, then log it here."
          endContent={<Button size="sm" label="Quality check" href={`/matches/${id}/qc`} />} />
      ) : (
        <LogTool matchId={id} mode={mode === "review" ? "review" : "events"} status={match.status}
          videoSrc={match.video_status === "ready" ? playbackUrl(match) : null}
          teams={[{ id: match.home_id, name: match.home }, { id: match.away_id, name: match.away }]}
          players={players} periods={match.periods} sample={sample ?? null} initial={initial} clip={{ before: CLIP_BEFORE, after: CLIP_AFTER }}
          startAt={t && Number.isFinite(Number(t)) ? Number(t) : null} />
      )}
    </VStack>
  );
}
