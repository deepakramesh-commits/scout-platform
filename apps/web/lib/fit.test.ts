import assert from "node:assert/strict";
import { test } from "node:test";
import { fitScore, standouts, type FitItem } from "./fit.ts";

const items: FitItem[] = [
  { attribute: "speed", priority: "very_high" },
  { attribute: "finishing", priority: "high" },
  { attribute: "pressing", priority: "medium" },
];

test("averages the evidence that exists per attribute, then weights by priority", () => {
  const fit = fitScore(items, {
    speed: { test: 80 },
    finishing: { match: 90, scout: 70 },
    pressing: { match: 20 },
  });
  assert.equal(fit.score, 70);
  assert.deepEqual(fit.items.map((i) => i.value), [80, 80, 20]);
  assert.equal(fit.measured, 3);
  assert.equal(fit.total, 3);
});

test("leaves out attributes with no evidence and reports coverage", () => {
  const fit = fitScore(items, { speed: { match: 60 } });
  assert.equal(fit.measured, 1);
  assert.equal(fit.coverage, 0.5);
  assert.equal(fit.score, 60);
  assert.equal(fit.items[1].value, null);
});

test("under half the weighted profile measured means not enough evidence", () => {
  const fit = fitScore(items, { finishing: { match: 99 }, pressing: { match: 99 } });
  assert.equal(fit.coverage, 0.5);
  assert.equal(fit.score, 99);
  const thin = fitScore(items, { finishing: { match: 99 } });
  assert.equal(thin.coverage, 2 / 6);
  assert.equal(thin.score, null);
});

test("an empty profile has no score", () => {
  assert.equal(fitScore([], {}).score, null);
});

test("standouts are the top two attributes above the 85th percentile", () => {
  assert.deepEqual(standouts({ a: 99, b: 86, c: 95, d: 85, e: 10 }), ["a", "c"]);
  assert.deepEqual(standouts({ a: 85 }), []);
});
