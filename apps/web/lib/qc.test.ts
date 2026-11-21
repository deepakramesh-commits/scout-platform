import assert from "node:assert/strict";
import { test } from "node:test";
import { qualityCheck, ruleFlags, type QcEvent } from "./qc.ts";

const ev = (id: string, o: Partial<QcEvent>): QcEvent => ({
  id, player_id: "a", team_id: "H", period: 1, video_seconds: 100, type: "pass", x: 50, y: 40, ...o,
});
const periods = [{ period: 1, start: 60, end: 60 + 47 * 60 }, { period: 2, start: 3300, end: 3300 + 49 * 60 }];
const lineups = [
  { player_id: "a", team_id: "H", started: true },
  { player_id: "b", team_id: "H", started: false },
  { player_id: "c", team_id: "A", started: true },
];

test("flags an event outside the marked playing time", () => {
  const flags = ruleFlags([ev("1", { video_seconds: 30 }), ev("2", { video_seconds: 600 }), ev("3", { period: 3, video_seconds: 9000 })], periods, lineups, []);
  assert.deepEqual(flags.map((f) => [f.event_id, f.rule]), [["1", "outside_playing_time"], ["3", "outside_playing_time"]]);
});

test("flags a substituted player who keeps playing, and a substitute before he came on", () => {
  const subs = [{ kind: "substitution", minute: 60, player_id: "a", player_in_id: "b", team_id: "H" }];
  // second half starts at video 3300 = minute 45; minute 70 is video 3300 + 25 * 60
  const late = 3300 + 25 * 60;
  const flags = ruleFlags([ev("1", { period: 2, video_seconds: late }), ev("2", { player_id: "b", period: 2, video_seconds: 3300 + 5 * 60 }),
    ev("3", { player_id: "b", period: 2, video_seconds: late })], periods, lineups, subs);
  assert.deepEqual(flags.map((f) => [f.event_id, f.rule]), [["1", "after_substitution"], ["2", "before_coming_on"]]);
});

test("flags a player who is not on the match sheet, or logged for the wrong team", () => {
  const flags = ruleFlags([ev("1", { player_id: "zz" }), ev("2", { player_id: "c" }), ev("3", { player_id: null })], periods, lineups, []);
  assert.deepEqual(flags.map((f) => [f.event_id, f.rule]), [["1", "not_on_sheet"], ["2", "wrong_team"]]);
});

test("flags play after a red card", () => {
  const flags = ruleFlags([ev("1", { video_seconds: 60 + 30 * 60 })], periods, lineups,
    [{ kind: "red_card", minute: 20, player_id: "a", player_in_id: null, team_id: "H" }]);
  assert.deepEqual(flags.map((f) => f.rule), ["after_red_card"]);
});

test("without marked periods the video time is read as the match clock", () => {
  assert.deepEqual(ruleFlags([ev("1", { video_seconds: 100 })], [], lineups, []), []);
});

const settings = { countAgreement: 0.9, locationTolerance: 10, timeWindow: 3 };
const sample = { period: 1, start: 0, end: 600 };

test("two analysts agree when type, player, time and location match", () => {
  const primary = [ev("p1", { video_seconds: 100 }), ev("p2", { video_seconds: 200, type: "shot" }), ev("p3", { video_seconds: 900 })];
  const review = [ev("r1", { video_seconds: 101.5, x: 55 }), ev("r2", { video_seconds: 201, type: "shot", x: 50, y: 40 })];
  const qc = qualityCheck(primary, review, sample, settings);
  assert.equal(qc.primaryCount, 2); // p3 is outside the sample window
  assert.equal(qc.agreed, 2);
  assert.equal(qc.agreement, 1);
  assert.equal(qc.passed, true);
});

test("a location more than the tolerance away, or a missing event, counts against agreement", () => {
  const primary = Array.from({ length: 10 }, (_, i) => ev(`p${i}`, { video_seconds: 10 + i * 20 }));
  const review = primary.map((p, i) => ({ ...p, id: `r${i}`, x: i === 0 ? 70 : p.x })).slice(0, 9);
  const qc = qualityCheck(primary, review, sample, settings);
  assert.equal(qc.agreed, 8);
  assert.equal(qc.agreement, 0.8);
  assert.equal(qc.passed, false);
  assert.deepEqual(qc.byType.pass, { primary: 10, review: 9, agreed: 8 });
});

test("an event is paired once, to the nearest in time", () => {
  const primary = [ev("p1", { video_seconds: 100 }), ev("p2", { video_seconds: 102 })];
  const review = [ev("r1", { video_seconds: 101.8 })];
  const qc = qualityCheck(primary, review, sample, settings);
  assert.equal(qc.agreed, 1);
  assert.deepEqual(qc.pairs, [["p2", "r1"]]);
});

test("an empty sample cannot pass", () => {
  assert.equal(qualityCheck([], [], sample, settings).passed, false);
});
