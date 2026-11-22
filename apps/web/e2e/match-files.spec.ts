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

test("the quality check and event log fit a phone", async ({ page }) => {
  const m = await demoMatch();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [email, path, heading] of [["analyst2@demo.scout", "qc", "Analyst accuracy"], ["analyst@demo.scout", "log", "Event log"]]) {
    await page.context().clearCookies();
    await signIn(page, email);
    await page.goto(`/matches/${m.id}/${path}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const cut = await page.evaluate(() => [...document.querySelectorAll("h2, th, td, label")]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.textContent?.trim()));
    expect(cut, `${path}: cut off at the right edge`).toEqual([]);
  }
});
