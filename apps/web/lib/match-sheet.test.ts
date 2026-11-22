import assert from "node:assert/strict";
import { test } from "node:test";
import { minutesPlayed, validateSheet, type Sheet, type SheetLine } from "./match-sheet.ts";

const POS = ["GK", "CB", "CB", "FB", "FB", "DM", "CM", "AM", "LW", "RW", "ST"] as const;
const lineup: SheetLine[] = [
  ...POS.map((position, i) => ({ player_id: `s${i}`, shirt_number: i + 1, position, started: true })),
  { player_id: "b1", shirt_number: 12, position: "ST", started: false },
  { player_id: "b2", shirt_number: 13, position: "CM", started: false },
];
const squad = lineup.map((l) => ({ player_id: l.player_id, shirt_number: l.shirt_number }));
const sheet = (o: Partial<Sheet> = {}): Sheet => ({ lineup, entries: [], length: 90, ...o });

test("a full, correct sheet has no errors", () => {
  const s = sheet({ entries: [
    { id: "1", kind: "goal", minute: 20, player_id: "s10", player_in_id: null },
    { id: "2", kind: "substitution", minute: 60, player_id: "s10", player_in_id: "b1" },
    { id: "3", kind: "goal", minute: 75, player_id: "b1", player_in_id: null },
    { id: "4", kind: "yellow_card", minute: 80, player_id: "s3", player_in_id: null },
  ] });
  assert.deepEqual(validateSheet(s, squad), []);
});

test("line-up rules: eleven starters, one goalkeeper, shirt numbers unique and from the squad", () => {
  const bad = sheet({ lineup: [...lineup.slice(0, 10), { ...lineup[11], shirt_number: 1 }, { player_id: "x", shirt_number: 50, position: "GK", started: true }] });
  const messages = validateSheet(bad, squad).map((e) => e.message);
  assert.ok(messages.includes("exactly one starter must be the goalkeeper"));
  assert.ok(messages.includes("shirt 1 is already used"));
  assert.ok(messages.includes("this player is not in the squad list"));
});

test("a substitution needs the player on the pitch and the substitute on the bench", () => {
  const s = sheet({ entries: [
    { id: "1", kind: "substitution", minute: 60, player_id: "s10", player_in_id: "b1" },
    { id: "2", kind: "substitution", minute: 70, player_id: "s10", player_in_id: "b2" },
    { id: "3", kind: "substitution", minute: 75, player_id: "s9", player_in_id: "b1" },
  ] });
  const errs = validateSheet(s, squad);
  assert.deepEqual(errs.map((e) => e.field), ["entries.1.player", "entries.2.player_in"]);
});

test("a goal by someone not on the pitch, and minutes out of range, are caught", () => {
  const s = sheet({ entries: [
    { id: "1", kind: "goal", minute: 10, player_id: "b1", player_in_id: null },
    { id: "2", kind: "goal", minute: 200, player_id: "s10", player_in_id: null },
  ] });
  assert.deepEqual(validateSheet(s, squad).map((e) => e.message), ["he is not on the pitch in minute 10", "minute must be 1 to 105"]);
});

test("minutes played follow substitutions, red cards and second yellows", () => {
  const m = minutesPlayed(sheet({ entries: [
    { id: "1", kind: "substitution", minute: 60, player_id: "s10", player_in_id: "b1" },
    { id: "2", kind: "red_card", minute: 30, player_id: "s1", player_in_id: null },
    { id: "3", kind: "yellow_card", minute: 40, player_id: "s2", player_in_id: null },
    { id: "4", kind: "yellow_card", minute: 70, player_id: "s2", player_in_id: null },
  ] }));
  assert.deepEqual([m.s10, m.b1, m.s1, m.s2, m.s0, m.b2], [60, 30, 30, 70, 90, 0]);
});

test("a minute past 130 is refused even in a match with extra time, as the database stores no later minute", () => {
  const s = sheet({ length: 120, entries: [{ id: "1", kind: "goal", minute: 131, player_id: "s10", player_in_id: null }] });
  assert.deepEqual(validateSheet(s, squad).map((e) => e.message), ["minute must be 1 to 130"]);
});
