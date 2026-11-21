import assert from "node:assert/strict";
import { test } from "node:test";
import { assessRisk, matchFoot, type RiskInput } from "./risk.ts";

const base: RiskInput = {
  matches: [
    { index: 60, stronger: true }, { index: 55, stronger: true },
    { index: 62, stronger: false }, { index: 58, stronger: false }, { index: 65, stronger: false },
  ],
  roles: ["Striker"], minutes: 420, matchesPlayed: 5, minMinutes: 270,
  birthYear: 2003, birthYearDemo: false, idVerified: true,
  market: { contractEnd: "2027-06-30", availability: "open_to_offers", transferConditions: null, demo: false },
  today: new Date("2026-11-21T00:00:00Z"),
};
const item = (input: RiskInput, key: string) => assessRisk(input).find((i) => i.key === key)!;

test("holding up against stronger sides is good; a big drop is a caution", () => {
  assert.equal(item(base, "stronger").status, "good");
  const drop = { ...base, matches: [{ index: 20, stronger: true }, { index: 30, stronger: true }, { index: 70, stronger: false }, { index: 80, stronger: false }] };
  const r = item(drop, "stronger");
  assert.equal(r.status, "caution");
  assert.match(r.reason, /75 against weaker sides \(2 matches\) to 25 against stronger \(2\)/);
});

test("fewer than two matches on either side of the split is unknown", () => {
  assert.equal(item({ ...base, matches: base.matches.slice(1) }, "stronger").status, "unknown");
});

test("a wide spread of the match index is a caution, fewer than 3 matches unknown", () => {
  assert.equal(item(base, "consistency").status, "good");
  const swings = { ...base, matches: [10, 90, 15, 85].map((index) => ({ index, stronger: false })) };
  assert.equal(item(swings, "consistency").status, "caution");
  assert.equal(item({ ...base, matches: base.matches.slice(0, 2) }, "consistency").status, "unknown");
});

test("one role is a caution, two or more good", () => {
  assert.equal(item(base, "roles").status, "caution");
  assert.equal(item({ ...base, roles: ["Striker", "Left winger"] }, "roles").reason, "Played as striker and left winger.");
});

test("minutes under the competition threshold are a caution", () => {
  assert.equal(item(base, "sample").status, "good");
  const r = item({ ...base, minutes: 200 }, "sample");
  assert.equal(r.status, "caution");
  assert.match(r.reason, /under the 270 needed/);
});

test("age is good only when known, real and checked against an ID", () => {
  assert.equal(item(base, "age").status, "good");
  assert.deepEqual([item({ ...base, birthYearDemo: true }, "age").status, item({ ...base, birthYearDemo: true }, "age").demo], ["caution", true]);
  assert.equal(item({ ...base, idVerified: false }, "age").status, "caution");
  assert.equal(item({ ...base, birthYear: null }, "age").status, "unknown");
});

test("transfer: not available is a caution, nothing recorded unknown, demo marked", () => {
  assert.equal(item(base, "transfer").status, "good");
  assert.equal(item({ ...base, market: { ...base.market!, availability: "not_available" } }, "transfer").status, "caution");
  assert.equal(item({ ...base, market: null }, "transfer").status, "unknown");
  assert.equal(item({ ...base, market: { ...base.market!, demo: true } }, "transfer").demo, true);
});

test("a contract that ends within a year makes a transfer realistic without stated availability", () => {
  const soon = { ...base, market: { contractEnd: "2027-03-31", availability: null, transferConditions: null, demo: false } };
  assert.equal(item(soon, "transfer").status, "good");
  const long = { ...base, market: { contractEnd: "2029-06-30", availability: null, transferConditions: null, demo: false } };
  assert.equal(item(long, "transfer").status, "caution");
});

test("the foot from match data needs enough touches and names the weaker side's share", () => {
  assert.deepEqual(matchFoot({ right: 80, left: 20 }), { foot: "right", weakShare: 20, touches: 100 });
  assert.deepEqual(matchFoot({ right: 45, left: 55 }), { foot: "both", weakShare: 45, touches: 100 });
  assert.equal(matchFoot({ right: 10, left: 5 }), null);
});
