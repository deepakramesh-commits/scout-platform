import assert from "node:assert/strict";
import { test } from "node:test";
import { CSV_COLUMNS, importCsv, importStatsBomb, parseCsv, type MatchContext } from "./import.ts";

const ctx: MatchContext = {
  home: { id: "H", name: "Zambia" }, away: { id: "A", name: "Ghana" },
  players: [
    { player_id: "p9", team_id: "H", shirt_number: 9, display_name: "Patson Daka" },
    { player_id: "p1", team_id: "A", shirt_number: 1, display_name: "Lawrence Ati-Zigi" },
  ],
};
const header = CSV_COLUMNS.map(([c]) => c).join(",");

test("parses quotes, doubled quotes, embedded commas and CRLF", () => {
  assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n\n'), [["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
});

test("a valid CSV imports with players resolved through the match sheet", () => {
  const csv = [header,
    "1,12:07,home,9,pass,complete,60,40,80,30,Right Foot,under_pressure;cross,,,",
    "2,67:30,Zambia,9,shot,goal,108,38,,,Left Foot,first_time,,,",
    "2,70:00,away,1,goalkeeper,success,4,40,,,,,,,shot_saved",
  ].join("\n");
  const r = importCsv(csv, ctx);
  assert.deepEqual(r.errors, []);
  assert.equal(r.events.length, 3);
  assert.deepEqual([r.events[0].player_id, r.events[0].video_seconds, r.events[0].extra], ["p9", 727, { under_pressure: true, cross: true }]);
  assert.equal(r.events[2].extra.gk_type, "shot_saved");
});

test("one bad row rejects the whole file and every error names its row", () => {
  const csv = [header,
    "1,12:07,home,9,pass,complete,60,40,80,30,Right Foot,,,,",
    "1,12:9,home,9,pass,complete,60,40,80,30,,,,,",
    "1,13:00,home,7,pass,complete,60,40,80,30,,,,,",
    "1,14:00,home,9,shot,scored,60,40,,,,,,,",
  ].join("\n");
  const r = importCsv(csv, ctx);
  assert.equal(r.events.length, 0);
  assert.deepEqual(r.errors.map((e) => e.row), [3, 4, 5]);
  assert.match(r.errors[1].message, /shirt 7/);
  assert.match(r.errors[2].message, /outcome must be one of/);
});

test("missing columns are reported before any row", () => {
  assert.match(importCsv("period,clock\n1,00:01", ctx).errors[0].message, /missing columns: team/);
});

test("StatsBomb-style JSON maps types, outcomes, flags and players by name or shirt", () => {
  const json = [
    { type: { id: 35, name: "Starting XI" }, period: 1, minute: 0, second: 0, team: { name: "Ghana" },
      tactics: { lineup: [{ player: { id: 77, name: "L. Ati-Zigi" }, jersey_number: 1 }] } },
    { type: { name: "Pass" }, period: 1, minute: 3, second: 5, team: { name: "Zambia" }, player: { name: "Patson Daka" },
      location: [50, 40], under_pressure: true, pass: { end_location: [70, 20], body_part: { name: "Right Foot" }, cross: true, type: { name: "Corner" } } },
    { type: { name: "Shot" }, period: 1, minute: 9, second: 0, team: { name: "Zambia" }, player: { name: "Patson Daka" },
      location: [110, 40], shot: { outcome: { name: "Wayward" }, body_part: { name: "Head" }, type: { name: "Open Play" }, end_location: [120, 30, 2] } },
    { type: { name: "Duel" }, period: 1, minute: 10, second: 0, team: { name: "Ghana" }, player: { name: "L. Ati-Zigi" },
      location: [5, 40], duel: { type: { name: "Tackle" }, outcome: { name: "Success In Play" } } },
    { type: { name: "Half End" }, period: 1, minute: 45, second: 0, team: { name: "Ghana" } },
  ];
  const r = importStatsBomb(json, ctx);
  assert.deepEqual(r.errors, []);
  assert.equal(r.skipped, 2);
  assert.deepEqual(r.events.map((e) => [e.type, e.outcome, e.player_id]), [["pass", "complete", "p9"], ["shot", "off_t", "p9"], ["tackle", "won", "p1"]]);
  assert.deepEqual(r.events[0].extra, { under_pressure: true, cross: true, set_piece: "corner" });
  assert.equal(r.events[1].end_x, null);
});

test("an unknown player in JSON is an error, not a guess", () => {
  const r = importStatsBomb([{ type: { name: "Pass" }, period: 1, minute: 1, second: 0, team: { name: "Zambia" }, player: { name: "Nobody" },
    location: [1, 1], pass: { end_location: [2, 2] } }], ctx);
  assert.match(r.errors[0].message, /not on the match sheet/);
});
