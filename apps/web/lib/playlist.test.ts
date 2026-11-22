import assert from "node:assert/strict";
import { test } from "node:test";
import { actionLabel, clipSrc, clipWindow, moved } from "./playlist.ts";

test("a clip runs from 5 seconds before the event to 8 after", () => {
  assert.deepEqual(clipWindow(723), { start: 718, end: 731 });
  assert.deepEqual(clipWindow(2.5), { start: 0, end: 10.5 }, "never before the start of the video");
});

test("the browser's player gets the clip as a media fragment", () => {
  assert.equal(clipSrc("/api/video/m1", clipWindow(100)), "/api/video/m1#t=95,108");
  assert.equal(clipSrc("https://stream.example/x.m3u8?token=t", { start: 1, end: 2 }), "https://stream.example/x.m3u8?token=t#t=1,2");
});

test("moving an item swaps it with its neighbour", () => {
  assert.deepEqual(moved(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moved(["a", "b", "c"], "b", 1), ["a", "c", "b"]);
});

test("an item at either end, or not in the list, does not move", () => {
  assert.equal(moved(["a", "b"], "a", -1), null);
  assert.equal(moved(["a", "b"], "b", 1), null);
  assert.equal(moved(["a", "b"], "z", 1), null);
});

test("an action reads in words", () => {
  assert.equal(actionLabel("shot", "saved"), "Shot, saved");
  assert.equal(actionLabel("ball_receipt", null), "Ball receipt");
  assert.equal(actionLabel("pass", "unknown_slug"), "Pass, unknown slug");
});
