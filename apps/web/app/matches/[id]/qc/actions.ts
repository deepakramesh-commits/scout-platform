"use server";

import { revalidatePath } from "next/cache";
import { db, requireMe, type Q } from "@/lib/auth";
import { checkOutcome, qualityCheck, ruleFlags, type Period, type QcEvent, type SheetEvent, type SheetLine } from "@/lib/qc";
import { readSettings } from "./data";

export type ActionResult = { ok: true; message: string; warning?: boolean } | { ok: false; error: string };

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const assigned = async (tx: Q, matchId: string, task: string) =>
  (await tx<{ ok: boolean }[]>`select app.assigned(${matchId}, ${task}) as ok`)[0].ok;

export async function saveSample(matchId: string, sample: { period: number; start: number; minutes: number }): Promise<ActionResult> {
  const user = await requireMe(["tagger", "admin"]);
  const { period, start, minutes } = sample;
  if (![1, 2, 3, 4].includes(period) || !Number.isFinite(start) || start < 0 || !Number.isFinite(minutes) || minutes <= 0 || minutes > 60) {
    return { ok: false, error: "Choose a period, a start time and a length of 1 to 60 minutes." };
  }
  try {
    await db(async (tx) => {
      if (!(await assigned(tx, matchId, "reviewer"))) throw new Error("Only the match's reviewer or an admin chooses the sample.");
      await tx`
        insert into qc_samples (match_id, period, start_seconds, end_seconds, reviewer_id)
        values (${matchId}, ${period}, ${start}, ${start + minutes * 60}, ${user.id})
        on conflict (match_id) do update set period = excluded.period, start_seconds = excluded.start_seconds,
          end_seconds = excluded.end_seconds, reviewer_id = excluded.reviewer_id`;
    });
  } catch (e) { return fail(e); }
  revalidatePath(`/matches/${matchId}/qc`);
  return { ok: true, message: "Sample window saved." };
}

const qcEvents = (tx: Q, table: "events" | "review_events", matchId: string) => tx<(QcEvent & { tagger_id: string | null })[]>`
  select id, player_id, team_id, period, video_seconds::float8 as video_seconds, type, x::float8 as x, y::float8 as y, tagger_id
  from ${tx(table)} where match_id = ${matchId}`;

const mainTagger = (events: { tagger_id: string | null }[]) => {
  const n = new Map<string, number>();
  for (const e of events) if (e.tagger_id) n.set(e.tagger_id, (n.get(e.tagger_id) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

export async function runCheck(matchId: string): Promise<ActionResult> {
  await requireMe(["tagger", "admin"]);
  let outcome = { publishable: false, message: "" };
  try {
    await db(async (tx) => {
      if (!(await assigned(tx, matchId, "reviewer"))) throw new Error("Only the match's reviewer or an admin runs the quality check.");
      const [sample] = await tx<{ period: number; start: number; end: number }[]>`
        select period, start_seconds::float8 as start, end_seconds::float8 as end from qc_samples where match_id = ${matchId}`;
      if (!sample) throw new Error("Choose the sample window first.");
      // Read before the events: a change committed after this read leaves the run stale, never wrongly current.
      const [m] = await tx<{ periods: Period[]; seen: string | null }[]>`select periods, inputs_changed_at::text as seen from matches where id = ${matchId}`;
      const [settings, primary, review, lineups, sheet] = await Promise.all([
        readSettings(tx), qcEvents(tx, "events", matchId), qcEvents(tx, "review_events", matchId),
        tx<SheetLine[]>`select player_id, team_id, started from lineups where match_id = ${matchId}`,
        tx<SheetEvent[]>`select kind, minute, player_id, player_in_id, team_id from match_sheet_events where match_id = ${matchId}`,
      ]);
      const r = qualityCheck(primary, review, sample, settings);
      const flags = ruleFlags(primary, m.periods, lineups, sheet).length;
      await tx`
        insert into qc_runs (match_id, analyst_id, reviewer_id, primary_count, review_count, agreed, agreement, passed, flags, details, inputs_seen)
        values (${matchId}, ${mainTagger(primary)}, ${mainTagger(review)}, ${r.primaryCount}, ${r.reviewCount}, ${r.agreed}, ${r.agreement},
                ${r.passed}, ${flags}, ${tx.json({ byType: r.byType, pairs: r.pairs, sample, settings })}, ${m.seen}::timestamptz)`;
      outcome = checkOutcome(r, flags);
    });
  } catch (e) { return fail(e); }
  revalidatePath(`/matches/${matchId}/qc`);
  return { ok: true, message: outcome.message, warning: !outcome.publishable };
}

/** Publishing goes through app.publish_match, which refuses unless the match is in review and the latest run passed with no rule flags on the current data. */
export async function publish(matchId: string): Promise<ActionResult> {
  await requireMe(["tagger", "admin"]);
  try { await db((tx) => tx`select app.publish_match(${matchId})`); } catch (e) { return fail(e); }
  revalidatePath(`/matches/${matchId}`, "layout");
  return { ok: true, message: "Published. The metrics job is queued; profiles update when the worker has run." };
}

/** Queues a StatsBomb JSON export for the worker through app.request_export, which only the reviewer or an admin may call. */
export async function requestExport(matchId: string): Promise<ActionResult> {
  await requireMe(["tagger", "admin"]);
  try { await db((tx) => tx`select app.request_export(${matchId})`); } catch (e) { return fail(e); }
  revalidatePath(`/matches/${matchId}/qc`);
  return { ok: true, message: "Export queued. The files appear here once the worker has run." };
}
