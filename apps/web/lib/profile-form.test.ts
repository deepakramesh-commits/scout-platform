import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProfile, priorityField } from "./profile-form.ts";

const known = { positions: new Set(["ST", "LW", "RW"]), attributes: new Set(["speed", "finishing"]) };

function form(fields: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
}

const valid = {
  name: " Target striker ", club: "", positions: ["ST"], ageMin: "18", ageMax: "23",
  attributes: ["speed", "finishing"], [priorityField("speed")]: "very_high", [priorityField("finishing")]: "medium",
};

test("a complete form parses into a profile", () => {
  const r = parseProfile(form(valid), known);
  assert.deepEqual(r, {
    ok: true,
    value: {
      name: "Target striker", club: null, positions: ["ST"], ageMin: 18, ageMax: 23,
      items: [{ attribute: "speed", priority: "very_high" }, { attribute: "finishing", priority: "medium" }],
    },
  });
});

test("the age range is optional", () => {
  const r = parseProfile(form({ ...valid, ageMin: "", ageMax: "" }), known);
  assert.ok(r.ok && r.value.ageMin === null && r.value.ageMax === null);
});

test("positions must be chosen, and from the known list", () => {
  assert.deepEqual(parseProfile(form({ ...valid, positions: [] }), known), { ok: false, errors: { positions: "Choose at least one position." } });
  const r = parseProfile(form({ ...valid, positions: ["XX"] }), known);
  assert.ok(!r.ok && r.errors.positions);
});

test("ages must be whole numbers from 14 to 45 with min not above max", () => {
  for (const [ageMin, ageMax] of [["13", ""], ["", "46"], ["20.5", ""], ["abc", ""]]) {
    const r = parseProfile(form({ ...valid, ageMin, ageMax }), known);
    assert.ok(!r.ok && r.errors.ages, `${ageMin}-${ageMax} rejected`);
  }
  const r = parseProfile(form({ ...valid, ageMin: "25", ageMax: "20" }), known);
  assert.ok(!r.ok && r.errors.ages);
  assert.ok(parseProfile(form({ ...valid, ageMin: "14", ageMax: "45" }), known).ok);
});

test("needs at least one attribute, each known and with a priority from the fixed set", () => {
  const none = parseProfile(form({ ...valid, attributes: [] }), known);
  assert.ok(!none.ok && none.errors.items === "Choose at least one attribute.");
  const unknown = parseProfile(form({ ...valid, attributes: ["telepathy"] }), known);
  assert.ok(!unknown.ok && unknown.errors.items);
  const badPriority = parseProfile(form({ ...valid, [priorityField("speed")]: "urgent" }), known);
  assert.ok(!badPriority.ok && badPriority.errors.items);
  const missingPriority = parseProfile(form({ ...valid, [priorityField("finishing")]: [] }), known);
  assert.ok(!missingPriority.ok && missingPriority.errors.items);
});

test("a blank name is rejected", () => {
  const r = parseProfile(form({ ...valid, name: "   " }), known);
  assert.ok(!r.ok && r.errors.name);
});
