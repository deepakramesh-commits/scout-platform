import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarket, parseTest } from "./market-form.ts";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

test("market details parse, and an empty field is stored as not recorded", () => {
  const r = parseMarket(form({
    heightCm: "181", preferredFoot: "left", contractEnd: "2027-06-30", availability: "open_to_offers",
    transferConditions: " Fee negotiable ", representative: "",
  }));
  assert.deepEqual(r, {
    ok: true,
    value: { heightCm: 181, preferredFoot: "left", contractEnd: "2027-06-30", availability: "open_to_offers", transferConditions: "Fee negotiable", representative: null },
  });
});

test("out-of-range height, unknown foot, impossible date and unknown availability are refused", () => {
  const r = parseMarket(form({ heightCm: "250", preferredFoot: "head", contractEnd: "2027-02-30", availability: "maybe" }));
  assert.deepEqual(r.ok ? null : Object.keys(r.errors).sort(), ["availability", "contractEnd", "heightCm", "preferredFoot"]);
});

const today = new Date("2026-11-21T12:00:00Z");
const kinds = new Set(["sprint_10m", "sprint_30m", "endurance", "jump"]);

test("a physical test parses with its kind, value and date", () => {
  const r = parseTest(form({ test: "sprint_30m", value: "4.12", testedAt: "2026-11-01" }), kinds, today);
  assert.deepEqual(r, { ok: true, value: { test: "sprint_30m", value: 4.12, testedAt: "2026-11-01", verified: false } });
});

test("a decimal comma is read as a decimal point", () => {
  const r = parseTest(form({ test: "sprint_10m", value: "1,74", testedAt: "2026-11-01" }), kinds, today);
  assert.equal(r.ok && r.value.value, 1.74);
});

test("a result no human could run is refused with the plausible range", () => {
  const r = parseTest(form({ test: "sprint_30m", value: "1.2", testedAt: "2026-11-01" }), kinds, today);
  assert.equal(r.ok ? null : r.errors.value, "A 30 m sprint is between 3 and 8 s.");
});

test("a test dated in the future, or of an unknown kind, is refused", () => {
  const r = parseTest(form({ test: "bench", value: "4", testedAt: "2026-12-01" }), kinds, today);
  assert.deepEqual(r.ok ? null : Object.keys(r.errors).sort(), ["test", "testedAt"]);
});

test("verified is read from the checkbox", () => {
  const r = parseTest(form({ test: "jump", value: "44", testedAt: "2026-11-21", verified: "on" }), kinds, today);
  assert.equal(r.ok && r.value.verified, true);
});
