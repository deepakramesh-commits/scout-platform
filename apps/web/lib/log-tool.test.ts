import assert from "node:assert/strict";
import { test } from "node:test";
import { denormalise, parseEventInput, parsePeriods, periodAt } from "./log-tool.ts";
import { normalise } from "./event-spec.ts";

const ID = "6f1c1a52-0f6b-4c1e-9a4e-0d6f3c1b2a11";
const P = "0b7e5d0c-2c9a-4f6e-8a1b-3c4d5e6f7a8b";
const T = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const pass = { id: ID, player_id: P, team_id: T, period: 1, video_seconds: 75.4, type: "pass", outcome: "complete", x: 60, y: 40, end_x: 80, end_y: 30, body_part: "Right Foot", extra: { cross: true } };

test("the period is the latest marked one already started, and 1 before any mark", () => {
  const periods = [{ period: 1, start: 30, end: 2800 }, { period: 2, start: 3600, end: 6400 }];
  assert.equal(periodAt([], 500), 1);
  assert.equal(periodAt(periods, 10), 1);
  assert.equal(periodAt(periods, 3000), 1);
  assert.equal(periodAt(periods, 3600), 2);
});

test("a valid pass parses with its client id", () => {
  const r = parseEventInput(pass);
  assert.ok(r.ok);
  assert.equal(r.value.id, ID);
  assert.deepEqual(r.value.extra, { cross: true });
});

test("an event the spec rejects, or one without a client id, is refused with reasons", () => {
  const noEnd = parseEventInput({ ...pass, end_x: null });
  assert.ok(!noEnd.ok && noEnd.errors.some((e) => e.includes("end location")));
  const noId = parseEventInput({ ...pass, id: "1" });
  assert.ok(!noId.ok && noId.errors[0].includes("uuid"));
  assert.ok(!parseEventInput({ ...pass, x: "60" }).ok);
});

test("an aerial duel is stored StatsBomb-style and reads back as the analyst entered it", () => {
  const won = parseEventInput({ ...pass, type: "duel", outcome: "won", end_x: null, end_y: null, body_part: null, extra: {} });
  assert.ok(won.ok);
  assert.equal(won.value.extra.aerial_won, true);
  assert.deepEqual(denormalise(won.value), { ...won.value, outcome: "won", extra: {} });
  const lost = normalise({ ...won.value, outcome: "lost", extra: {} });
  assert.equal(lost.outcome, null);
  assert.equal(denormalise(lost).outcome, "lost");
});

test("period marks must be ordered, unique and start before they end", () => {
  assert.ok(parsePeriods([{ period: 2, start: 3600, end: 6400 }, { period: 1, start: 30, end: 2800 }]).ok);
  const overlap = parsePeriods([{ period: 1, start: 30, end: 4000 }, { period: 2, start: 3600, end: 6400 }]);
  assert.ok(!overlap.ok && overlap.errors[0].includes("before period 1 ends"));
  assert.ok(!parsePeriods([{ period: 1, start: 50, end: 40 }]).ok);
  assert.ok(!parsePeriods([{ period: 1, start: 0, end: 40 }, { period: 1, start: 50, end: 90 }]).ok);
});
