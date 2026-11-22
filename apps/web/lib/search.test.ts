import assert from "node:assert/strict";
import { test } from "node:test";
import { describeSearch, newMatches, parseSearch, searchQuery } from "./search.ts";

const CUP = "11111111-1111-4111-8111-111111111111";
const LEAGUE = "22222222-2222-4222-8222-222222222222";
const options = { keys: ["cut_ins", "xg"], roles: ["LW", "ST"], countries: ["Ghana"], competitions: [{ id: LEAGUE }, { id: CUP }] };

test("unknown filters are dropped and the sort falls back", () => {
  const f = parseSearch({ role: "XX", sort: "nope", country: "Atlantis", minPct: "-3", contractBy: "2027-13-45", competition: "x" }, options);
  assert.deepEqual(f, { competition: LEAGUE, role: null, sort: "cut_ins", minPct: null, name: null, minMinutes: null, country: null, ageMin: null, ageMax: null, contractBy: null });
});

test("a saved search round-trips through its query string", () => {
  const f = parseSearch({ competition: CUP, role: "LW", sort: "xg", minPct: "80", name: "Sarr", minMinutes: "270", country: "Ghana", ageMax: "23", contractBy: "2027-06-30" }, options);
  const q = searchQuery(f);
  assert.equal(q, `competition=${CUP}&role=LW&sort=xg&minPct=80&name=Sarr&minMinutes=270&country=Ghana&ageMax=23&contractBy=2027-06-30`);
  assert.deepEqual(parseSearch(Object.fromEntries(new URLSearchParams(q)), options), f);
  assert.equal(describeSearch(f, { competition: (id) => (id === CUP ? "Cup 2024" : id) }), "Competition Cup 2024 · Position LW · Ranked by xg · Min percentile 80 · Name Sarr · Min minutes 270 · Country Ghana · Age to 23 · Contract ends by 2027-06-30");
});

test("with no competition holding numbers, nothing is ranked", () => {
  assert.equal(parseSearch({}, { ...options, competitions: [] }).competition, null);
});

test("new matches are the players matching now that were not seen", () => {
  assert.deepEqual(newMatches(["a", "b", "b", "c"], ["b"]), ["a", "c"]);
  assert.deepEqual(newMatches([], ["a"]), []);
});
