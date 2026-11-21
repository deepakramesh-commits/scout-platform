import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReport, ratingField } from "./report-form.ts";

const known = new Set(["work_ethic", "passing", "speed"]);

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

const valid = {
  seenIn: " Zambia v Tanzania, 21 Jan ", recommendation: "follow", strengths: "Presses", weaknesses: "", comments: "",
  [ratingField("work_ethic")]: "8", [ratingField("passing")]: "", [ratingField("speed")]: "10",
};

test("a report keeps only the ratings that were given", () => {
  assert.deepEqual(parseReport(form(valid), known), {
    ok: true,
    value: {
      seenIn: "Zambia v Tanzania, 21 Jan", recommendation: "follow", strengths: "Presses", weaknesses: "", comments: "",
      ratings: { work_ethic: 8, speed: 10 },
    },
  });
});

test("every rating can be left empty when the scout writes something", () => {
  const r = parseReport(form({ ...valid, [ratingField("work_ethic")]: "", [ratingField("speed")]: "" }), known);
  assert.equal(r.ok, true);
});

test("a report with no rating and no words is refused", () => {
  const r = parseReport(form({ seenIn: "Training", recommendation: "pass" }), known);
  assert.deepEqual(r, { ok: false, errors: { content: "Give at least one rating or write a strength, weakness or comment." } });
});

test("ratings outside 1 to 10, or not whole, are refused", () => {
  for (const bad of ["0", "11", "7.5", "seven"]) {
    const r = parseReport(form({ ...valid, [ratingField("work_ethic")]: bad }), known);
    assert.deepEqual(r.ok ? null : r.errors.ratings, "Ratings are whole numbers from 1 to 10.", bad);
  }
});

test("a rating for an attribute outside the registry is refused", () => {
  const r = parseReport(form({ ...valid, [ratingField("charisma")]: "9" }), known);
  assert.equal(r.ok ? null : r.errors.ratings, "Rate only the attributes on the form.");
});

test("where he was seen and a recommendation are required", () => {
  const r = parseReport(form({ ...valid, seenIn: " ", recommendation: "buy" }), known);
  assert.deepEqual(r.ok ? null : Object.keys(r.errors).sort(), ["recommendation", "seenIn"]);
});

test("long text is refused, not cut", () => {
  const r = parseReport(form({ ...valid, comments: "x".repeat(4001) }), known);
  assert.equal(r.ok ? null : r.errors.comments, "Keep this under 4000 characters.");
});
