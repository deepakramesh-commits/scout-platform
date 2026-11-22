import { expect, test } from "@playwright/test";
import { demoMatch, signIn } from "./fixtures";

// Regressions from the phase 5 review: unpublished match video reached scouts, and any staff member could download an export.
test("a scout cannot stream the video of a match that is not published", async ({ page }) => {
  const m = await demoMatch();
  await signIn(page, "scout@demo.scout");
  expect((await page.request.get(`/api/video/${m.id}`, { headers: { Range: "bytes=0-1" } })).status()).toBe(404);
});

test("only the match's reviewer or an admin downloads its export", async ({ page }) => {
  const m = await demoMatch();
  await signIn(page, "analyst@demo.scout");
  const res = await page.request.get(`/api/export/${m.id}/events/${m.id}.json`);
  expect(res.status()).toBe(403);
});
