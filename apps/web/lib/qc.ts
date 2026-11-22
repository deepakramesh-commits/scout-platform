// The quality check: rule-based error flags on a logged match, and agreement between two analysts on a sample.
// Pure: no imports, so `node --test` runs it.

export type QcEvent = {
  id: string; player_id: string | null; team_id: string; period: number; video_seconds: number; type: string;
  x: number | null; y: number | null;
};
/** Where each period starts and ends in the video, marked by the analyst. */
export type Period = { period: number; start: number; end: number };
export type SheetLine = { player_id: string; team_id: string; started: boolean };
export type SheetEvent = { kind: string; minute: number; player_id: string; player_in_id: string | null; team_id: string };
export type Rule = "outside_playing_time" | "not_on_sheet" | "wrong_team" | "after_substitution" | "before_coming_on" | "after_red_card";
export type RuleFlag = { event_id: string; rule: Rule; message: string };

const PERIOD_OFFSET: Record<number, number> = { 1: 0, 2: 45, 3: 90, 4: 105 };
/** A minute of slack either side: the sheet records whole minutes. */
const SLACK = 1;

/** The match minute of an event. Without marked periods the video time is the match clock (open data has no video). */
export function matchMinute(e: Pick<QcEvent, "period" | "video_seconds">, periods: Period[]): number {
  const p = periods.find((q) => q.period === e.period);
  return p ? (PERIOD_OFFSET[e.period] ?? 0) + (e.video_seconds - p.start) / 60 : e.video_seconds / 60;
}

export function ruleFlags(events: QcEvent[], periods: Period[], lineups: SheetLine[], sheet: SheetEvent[]): RuleFlag[] {
  const lineup = new Map(lineups.map((l) => [l.player_id, l]));
  const offAt = new Map(sheet.filter((s) => s.kind === "substitution").map((s) => [s.player_id, s.minute]));
  const onAt = new Map(sheet.filter((s) => s.kind === "substitution" && s.player_in_id).map((s) => [s.player_in_id!, s.minute]));
  const sentOffAt = new Map(sheet.filter((s) => s.kind === "red_card").map((s) => [s.player_id, s.minute]));
  const flags: RuleFlag[] = [];
  for (const e of events) {
    const flag = (rule: Rule, message: string) => flags.push({ event_id: e.id, rule, message });
    if (periods.length) {
      const p = periods.find((q) => q.period === e.period);
      if (!p || e.video_seconds < p.start || e.video_seconds > p.end) {
        flag("outside_playing_time", p ? `at ${clock(e.video_seconds)}, outside period ${e.period} (${clock(p.start)} to ${clock(p.end)})` : `period ${e.period} was not played`);
        continue;
      }
    }
    if (!e.player_id) continue;
    const l = lineup.get(e.player_id);
    if (!l) { flag("not_on_sheet", "this player is not on the match sheet"); continue; }
    if (l.team_id !== e.team_id) { flag("wrong_team", "the match sheet has this player in the other team"); continue; }
    const minute = matchMinute(e, periods);
    const off = offAt.get(e.player_id);
    const on = onAt.get(e.player_id);
    const red = sentOffAt.get(e.player_id);
    if (off != null && minute > off + SLACK) flag("after_substitution", `minute ${Math.floor(minute)}, but he was substituted in minute ${off}`);
    else if (!l.started && on != null && minute < on - SLACK) flag("before_coming_on", `minute ${Math.floor(minute)}, but he came on in minute ${on}`);
    else if (red != null && minute > red + SLACK) flag("after_red_card", `minute ${Math.floor(minute)}, but he was sent off in minute ${red}`);
  }
  return flags;
}

/** Video seconds as m:ss. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export type QcSettings = { countAgreement: number; locationTolerance: number; timeWindow: number };
export type Sample = { period: number; start: number; end: number };
export type QcResult = {
  primaryCount: number; reviewCount: number; agreed: number; agreement: number; passed: boolean;
  byType: Record<string, { primary: number; review: number; agreed: number }>;
  pairs: [string, string][];
};

/**
 * The second analyst logs the sample window again. An event agrees when the other analyst logged the same type for
 * the same player within `timeWindow` seconds, at a location within `locationTolerance` pitch units.
 * Agreement = agreeing events / the larger of the two counts, so a missed or an invented event both count against it.
 */
/** Two paired events are near when both are located within `tolerance` pitch units, or neither is located. */
export function near(a: Pick<QcEvent, "x" | "y">, b: Pick<QcEvent, "x" | "y">, tolerance: number): boolean {
  const located = a.x != null && b.x != null && a.y != null && b.y != null;
  return located ? Math.hypot(a.x! - b.x!, a.y! - b.y!) <= tolerance : a.x == null && b.x == null;
}

export function qualityCheck(primary: QcEvent[], review: QcEvent[], sample: Sample, s: QcSettings): QcResult {
  const inSample = (e: QcEvent) => e.period === sample.period && e.video_seconds >= sample.start && e.video_seconds <= sample.end;
  const a = primary.filter(inSample);
  const b = review.filter(inSample);
  const used = new Set<string>();
  const pairs: [string, string][] = [];
  const byType: QcResult["byType"] = {};
  const bump = (t: string, k: "primary" | "review" | "agreed") => ((byType[t] ??= { primary: 0, review: 0, agreed: 0 })[k] += 1);
  a.forEach((e) => bump(e.type, "primary"));
  b.forEach((e) => bump(e.type, "review"));
  let agreed = 0;
  for (const r of [...b].sort((x, y) => x.video_seconds - y.video_seconds)) {
    const match = a
      .filter((p) => !used.has(p.id) && p.type === r.type && p.player_id === r.player_id && Math.abs(p.video_seconds - r.video_seconds) <= s.timeWindow)
      .sort((x, y) => Math.abs(x.video_seconds - r.video_seconds) - Math.abs(y.video_seconds - r.video_seconds))[0];
    if (!match) continue;
    used.add(match.id);
    pairs.push([match.id, r.id]);
    if (near(match, r, s.locationTolerance)) { agreed += 1; bump(r.type, "agreed"); }
  }
  const denominator = Math.max(a.length, b.length);
  const agreement = denominator ? agreed / denominator : 0;
  return { primaryCount: a.length, reviewCount: b.length, agreed, agreement, passed: denominator > 0 && agreement >= s.countAgreement, byType, pairs };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The banner after a check runs; a match is publishable only when the check passed with no rule flags. */
export function checkOutcome(r: Pick<QcResult, "agreement" | "agreed" | "primaryCount" | "reviewCount" | "passed">, flags: number) {
  const counts = `${Math.round(r.agreement * 100)}% agreement (${r.agreed} of ${Math.max(r.primaryCount, r.reviewCount)} events agree)`;
  const verdict = !r.passed ? "not enough to publish"
    : flags > 0 ? `passed, but ${plural(flags, "rule flag")} must be fixed before publishing` : "passed";
  return { publishable: r.passed && flags === 0, message: `${counts}: ${verdict}.` };
}

/** Why the match cannot publish yet, or null. app.publish_match enforces the same rules. */
export function publishBlocker(status: string, latest: { passed: boolean; flags: number; current: boolean } | undefined): string | null {
  if (status !== "review") return "The analyst must send the match to review from the event log first";
  if (!latest) return "Run the quality check first";
  if (!latest.passed) return "The latest quality check must pass before the match can publish";
  if (latest.flags > 0) return `Fix the ${plural(latest.flags, "rule flag")} in the event log, then run the quality check again`;
  if (!latest.current) return "The events, lineups, sheet or periods changed after the latest check: run the quality check again";
  return null;
}
