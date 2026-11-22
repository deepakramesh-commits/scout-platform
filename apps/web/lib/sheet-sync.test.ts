import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSheetBody, sheetFromRows, uuid } from "./sheet-sync.ts";
import { isUuid } from "./log-tool.ts";

test("ids made on the phone are v4 uuids and differ", () => {
  const a = uuid();
  assert.ok(isUuid(a));
  assert.equal(a[14], "4");
  assert.notEqual(a, uuid());
});

test("a stored sheet reads back, extra time inferred from minutes over 90", () => {
  const p = uuid();
  const rows = [{ player_id: p, shirt_number: 9, position: "ST" as const, started: true, minutes_played: 120 }];
  const s = sheetFromRows(rows, []);
  assert.equal(s.length, 120);
  assert.deepEqual(s.lineup, [{ player_id: p, shirt_number: 9, position: "ST", started: true }]);
  assert.equal(sheetFromRows([{ ...rows[0], minutes_played: 90 }], []).length, 90);
});

test("the body the phone sends parses, and a malformed one is refused", () => {
  const [team, p, q, id] = [uuid(), uuid(), uuid(), uuid()];
  const body = {
    team_id: team,
    sheet: {
      length: 90,
      lineup: [{ player_id: p, shirt_number: 9, position: "ST", started: true }, { player_id: q, shirt_number: null, position: null, started: false }],
      entries: [{ id, kind: "substitution", minute: 60, player_id: p, player_in_id: q }],
    },
  };
  const r = parseSheetBody(body);
  assert.ok(r.ok);
  assert.equal(r.value.sheet.entries[0].id, id);
  assert.ok(!parseSheetBody({ ...body, sheet: { ...body.sheet, length: 100 } }).ok);
  assert.ok(!parseSheetBody({ ...body, sheet: { ...body.sheet, entries: [{ ...body.sheet.entries[0], kind: "corner" }] } }).ok);
  assert.ok(!parseSheetBody({ ...body, sheet: { ...body.sheet, lineup: [{ ...body.sheet.lineup[0], position: "SW" }] } }).ok);
});
