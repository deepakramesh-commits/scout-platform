import { expect, test, type Page } from "@playwright/test";
import { demoMatch, resetMatch, seedLineups, signIn, sql, type Demo } from "./fixtures";

test.describe.configure({ mode: "serial" });
let m: Demo;
test.beforeAll(async () => { m = await demoMatch(); await resetMatch(m.id); await seedLineups(m); });
test.afterAll(async () => { await resetMatch(m.id); });

const HEADER = "period,clock,team,shirt,type,outcome,x,y,end_x,end_y,body_part,flags,set_piece,card,gk_type";
const count = async () => (await sql<{ n: number }[]>`select count(*)::int as n from events where match_id = ${m.id}`)[0].n;

async function upload(page: Page, name: string, text: string) {
  // A file set before React hydrates the page is dropped, so set it again until the field names it.
  await expect(async () => {
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
    await expect(page.getByRole("button", { name: `Event file, ${name}` })).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Import events" }).click();
}

test("a bad CSV lists every row error and imports nothing", async ({ page }) => {
  await signIn(page, "analyst@demo.scout");
  await page.goto(`/matches/${m.id}/import`);
  await upload(page, "bad.csv", [HEADER,
    "1,12:07,home,9,pass,complete,60,40,80,30,Right Foot,,,,",
    "1,13:00,home,42,pass,complete,60,40,80,30,,,,,",
    "1,14:00,away,9,header,,60,40,,,,,,,",
    "2,61:10,home,9,pass,complete,60,40,,,,,,,",
  ].join("\n"));
  await expect(page.getByText("Nothing imported: 3 problems")).toBeVisible();
  await expect(page.getByRole("cell", { name: "no player with shirt 42 on the match sheet for that team" })).toBeVisible();
  await expect(page.getByRole("cell", { name: 'unknown event type "header"' })).toBeVisible();
  await expect(page.getByRole("cell", { name: "pass needs an end location on the pitch" })).toBeVisible();
  expect(await count()).toBe(0);
  expect((await sql`select count(*)::int as n from imports where match_id = ${m.id}`)[0].n).toBe(0);
});

test("a good CSV imports every row as imported events", async ({ page }) => {
  await signIn(page, "analyst@demo.scout");
  await page.goto(`/matches/${m.id}/import`);
  await upload(page, "good.csv", [HEADER,
    "1,12:07,home,9,pass,complete,60,40,80,30,Right Foot,under_pressure;cross,,,",
    "2,67:30,home,9,shot,goal,108,38,,,Left Foot,first_time,,,",
    "2,70:00,away,1,goalkeeper,success,4,40,,,,,,,shot_saved",
  ].join("\n"));
  await expect(page.getByText("Imported 3 events")).toBeVisible();
  const rows = await sql`select type, source, video_seconds::float8 as t, extra from events where match_id = ${m.id} order by video_seconds`;
  expect(rows.map((r) => `${r.type}/${r.source}/${r.t}`)).toEqual(["pass/import/727", "shot/import/4050", "goalkeeper/import/4200"]);
  expect(rows[0].extra).toEqual({ under_pressure: true, cross: true });
  const [imp] = await sql`select format, rows_imported from imports where match_id = ${m.id}`;
  expect(imp).toMatchObject({ format: "csv", rows_imported: 3 });
  expect((await sql`select status from matches where id = ${m.id}`)[0].status).toBe("tagging");
  await expect(page.getByRole("cell", { name: "good.csv" })).toBeVisible();
});
