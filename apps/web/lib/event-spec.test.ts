import assert from "node:assert/strict";
import { test } from "node:test";
import { checkEvent, EVENT_SPEC, normalise, type LoggedEvent } from "./event-spec.ts";

const base: LoggedEvent = { type: "pass", outcome: "complete", x: 50, y: 40, end_x: 70, end_y: 30, body_part: "Right Foot", extra: {} };

test("every type has a unique keyboard key", () => {
  const keys = EVENT_SPEC.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("a complete pass with both locations is valid", () => {
  assert.deepEqual(checkEvent(base), []);
});

test("fixed choices are enforced", () => {
  assert.match(checkEvent({ ...base, outcome: "great" }).join(), /outcome must be one of/);
  assert.match(checkEvent({ ...base, end_x: null, end_y: null }).join(), /needs an end location/);
  assert.match(checkEvent({ ...base, x: 130 }).join(), /on the pitch/);
  assert.match(checkEvent({ ...base, extra: { first_time: true } }).join(), /does not apply to a pass/);
  assert.match(checkEvent({ ...base, type: "pressure", outcome: null, end_x: null, end_y: null, body_part: "Head" }).join(), /body part not allowed/);
  assert.match(checkEvent({ ...base, type: "goalkeeper", outcome: "success", end_x: null, end_y: null, body_part: null }).join(), /needs its type/);
  assert.match(checkEvent({ ...base, type: "foul_committed", outcome: null, body_part: null, extra: { card: "green" } }).join(), /card must be one of/);
});

test("aerial duels are stored the StatsBomb way", () => {
  const won = normalise({ ...base, type: "duel", outcome: "won", body_part: null });
  assert.deepEqual([won.outcome, won.extra.aerial_won, won.extra.duel_type], ["won", true, "aerial"]);
  const lost = normalise({ ...base, type: "duel", outcome: "lost", body_part: null });
  assert.deepEqual([lost.outcome, lost.extra.duel_type], [null, "aerial_lost"]);
});
