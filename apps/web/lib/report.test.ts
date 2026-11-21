import assert from "node:assert/strict";
import { test } from "node:test";
import { isShareToken, newShareLink, scoutGroupAverages, SHARE_DAYS } from "./report.ts";

const attributes = [
  { key: "passing", label: "Passing", grp: "technical" as const },
  { key: "dribbling", label: "Dribbling", grp: "technical" as const },
  { key: "speed", label: "Speed", grp: "physical" as const },
  { key: "leadership", label: "Leadership", grp: "mental" as const },
];

test("averages the scouts' ratings per group on the 1 to 10 scale, ignoring match and test evidence", () => {
  const groups = scoutGroupAverages(attributes, {
    passing: { scout: 70, match: 95 },
    dribbling: { scout: 65 },
    speed: { test: 80 },
    leadership: { scout: 90 },
  });
  assert.deepEqual(groups.map((g) => [g.group, g.avg, g.rated.length]), [
    ["technical", 6.75, 2],
    ["physical", null, 0],
    ["tactical", null, 0],
    ["mental", 9, 1],
  ]);
  assert.deepEqual(groups[0].rated, [{ key: "passing", label: "Passing", value: 7 }, { key: "dribbling", label: "Dribbling", value: 6.5 }]);
});

test("a share link is a fresh 32-byte base64url token that expires in 14 days", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  const a = newShareLink(now);
  const b = newShareLink(now);
  assert.equal(SHARE_DAYS, 14);
  assert.equal(Buffer.from(a.token, "base64url").length, 32);
  assert.ok(isShareToken(a.token));
  assert.notEqual(a.token, b.token);
  assert.equal(a.expiresAt.toISOString(), "2026-12-05T12:00:00.000Z");
});

test("only a well-formed token reaches the database", () => {
  assert.equal(isShareToken(""), false);
  assert.equal(isShareToken("a".repeat(42)), false);
  assert.equal(isShareToken(`${"a".repeat(42)}=`), false);
  assert.equal(isShareToken("'; drop table report_links; --".padEnd(43, "x")), false);
});
