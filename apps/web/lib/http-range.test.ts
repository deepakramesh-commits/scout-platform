import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRange } from "./http-range.ts";

test("ranges the browser's player sends", () => {
  assert.equal(parseRange(null, 1000), null);
  assert.deepEqual(parseRange("bytes=0-", 1000), { start: 0, end: 999 });
  assert.deepEqual(parseRange("bytes=100-199", 1000), { start: 100, end: 199 });
  assert.deepEqual(parseRange("bytes=900-5000", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
});

test("a range outside the file is unsatisfiable; a malformed one gets the whole file", () => {
  assert.equal(parseRange("bytes=1000-", 1000), "unsatisfiable");
  assert.equal(parseRange("bytes=500-400", 1000), "unsatisfiable");
  assert.equal(parseRange("bytes=0-1,5-9", 1000), null);
  assert.equal(parseRange("items=0-1", 1000), null);
});
