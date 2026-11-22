import { expect, test } from "@playwright/test";
import { demoMatch, resetMatch, seedLineups, signIn, sql, type Demo } from "./fixtures";

let m: Demo;
test.beforeAll(async () => { m = await demoMatch(); await resetMatch(m.id); await seedLineups(m); });
test.afterAll(async () => { await resetMatch(m.id); });

test("an event saves on entry and is still there after a reload", async ({ page }) => {
  await signIn(page, "analyst@demo.scout");
  await page.goto(`/matches/${m.id}/log`);
  await expect(page.getByRole("heading", { name: "Event log" })).toBeVisible();
  const pitch = page.getByRole("img", { name: /attacking to the right/ });
  await page.getByRole("heading", { name: "Keys" }).click(); // keyboard focus out of any field

  await page.keyboard.type("9");
  await page.keyboard.press("p");
  await expect(page.getByText(/pass\. Click where it starts/)).toBeVisible();
  const box = (await pitch.boundingBox())!;
  await pitch.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await pitch.click({ position: { x: box.width * 0.75, y: box.height * 0.25 } });
  await expect(page.getByRole("cell", { name: /Pass, complete/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Saved", exact: true })).toBeVisible({ timeout: 30_000 });

  const [e] = await sql`select type, outcome, x::float8 as x, y::float8 as y, end_x::float8 as end_x, end_y::float8 as end_y, period, source
                        from events where match_id = ${m.id}`;
  expect(e).toMatchObject({ type: "pass", outcome: "complete", x: 60, y: 40, end_x: 90, end_y: 20, period: 1, source: "manual" });
  expect((await sql`select status from matches where id = ${m.id}`)[0].status).toBe("tagging");

  await page.reload();
  await expect(page.getByRole("cell", { name: /Pass, complete/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /9 Enock Lungu/ })).toBeVisible();
  expect((await sql`select count(*)::int as n from events where match_id = ${m.id}`)[0].n).toBe(1);
});
