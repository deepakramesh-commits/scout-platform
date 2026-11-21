import assert from "node:assert/strict";
import { test } from "node:test";
import { describeSearch, newMatches, parseSearch, searchQuery } from "./search.ts";

const options = { keys: ["cut_ins", "xg"], roles: ["LW", "ST"], countries: ["Ghana"] };

test("unknown filters are dropped and the sort falls back", () => {
  const f = parseSearch({ role: "XX", sort: "nope", country: "Atlantis", minPct: "-3", contractBy: "2027-13-45" }, options);
  assert.deepEqual(f, { role: null, sort: "cut_ins", minPct: null, name: null, minMinutes: null, country: null, ageMin: null, ageMax: null, contractBy: null });
});

test("a saved search round-trips through its query string", () => {
  const f = parseSearch({ role: "LW", sort: "xg", minPct: "80", name: "Sarr", minMinutes: "270", country: "Ghana", ageMax: "23", contractBy: "2027-06-30" }, options);
  const q = searchQuery(f);
  assert.equal(q, "role=LW&sort=xg&minPct=80&name=Sarr&minMinutes=270&country=Ghana&ageMax=23&contractBy=2027-06-30");
  assert.deepEqual(parseSearch(Object.fromEntries(new URLSearchParams(q)), options), f);
  assert.equal(describeSearch(f), "Position LW · Ranked by xg · Min percentile 80 · Name Sarr · Min minutes 270 · Country Ghana · Age to 23 · Contract ends by 2027-06-30");
});

test("new matches are the players matching now that were not seen", () => {
  assert.deepEqual(newMatches(["a", "b", "b", "c"], ["b"]), ["a", "c"]);
  assert.deepEqual(newMatches([], ["a"]), []);
});
