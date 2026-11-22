import { expect, test, type Page } from "@playwright/test";
import { demoMatch, resetMatch, signIn, sql, type Demo } from "./fixtures";

test.describe.configure({ mode: "serial" });
let m: Demo;
test.beforeAll(async () => { m = await demoMatch(); await resetMatch(m.id); });
test.afterAll(async () => { await resetMatch(m.id); });

type Squad = { shirt: number; name: string }[];
const squadOf = async (teamId: string): Promise<Squad> => sql<Squad>`
  select s.shirt_number as shirt, p.display_name as name from squad_members s join players p on p.id = s.player_id
  where s.team_id = ${teamId} order by s.shirt_number`;

async function pick(page: Page, name: string, role: "Starts" | "Bench") {
  await page.getByRole("radiogroup", { name: `${name}: starts, bench or not named` }).getByRole("radio", { name: role }).click();
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).last().click();
  await page.getByRole("option", { name: option }).click();
}

async function addEntry(page: Page, kind: string, minute: number, player: string, playerIn?: string) {
  await page.getByRole("button", { name: `Add ${kind}` }).click();
  await page.getByLabel("Minute").last().fill(String(minute));
  await page.getByLabel("Minute").last().press("Tab");
  await choose(page, kind === "substitution" ? "Player off" : "Player", player);
  if (playerIn) await choose(page, "Player on", playerIn);
}

test("the sheet checks entries as they are typed", async ({ page }) => {
  const squad = await squadOf(m.home_id);
  await signIn(page, "coordinator@demo.scout");
  await page.goto(`/matches/${m.id}/sheet`);
  const send = page.getByRole("button", { name: `Send ${m.home} sheet` });
  await expect(page.getByText("pick 11 starters (0 picked)").first()).toBeVisible();
  await expect(send).toHaveAttribute("aria-disabled", "true");

  for (const p of squad.slice(0, 11)) await pick(page, p.name, "Starts");
  await expect(page.getByText("11 of 11 starters")).toBeVisible();
  await expect(page.getByText("Ready to send.")).toBeVisible();

  // A substitution needs a player from the bench, and nobody is on it yet.
  await addEntry(page, "substitution", 60, `11 · ${squad[10].name}`);
  await expect(page.getByText("pick the substitute from the bench").first()).toBeVisible();
  await expect(send).toHaveAttribute("aria-disabled", "true");
  expect((await sql`select count(*)::int as n from lineups where match_id = ${m.id}`)[0].n).toBe(0);
});

test("offline, the sheet is kept on the phone and arrives once when the connection returns", async ({ page, context }) => {
  const squad = await squadOf(m.home_id);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "coordinator@demo.scout");
  await page.goto(`/matches/${m.id}/sheet`);
  for (const p of squad.slice(0, 11)) await pick(page, p.name, "Starts");
  for (const p of squad.slice(11)) await pick(page, p.name, "Bench");
  await addEntry(page, "substitution", 60, `11 · ${squad[10].name}`, `16 · ${squad[15].name}`);
  await addEntry(page, "yellow card", 70, `4 · ${squad[3].name}`);
  await expect(page.getByText("Ready to send.")).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("button", { name: `Send ${m.home} sheet` }).click();
  await expect(page.getByText("Saved on this phone, will send")).toBeVisible();
  expect((await sql`select count(*)::int as n from lineups where match_id = ${m.id}`)[0].n).toBe(0);

  await context.setOffline(false);
  await expect(page.getByRole("main").getByText("Sent", { exact: true })).toBeVisible();
  const rows = await sql<{ shirt_number: number; minutes_played: number; started: boolean }[]>`
    select shirt_number, minutes_played, started from lineups where match_id = ${m.id} and team_id = ${m.home_id} order by shirt_number`;
  expect(rows).toHaveLength(16);
  expect(rows.find((r) => r.shirt_number === 11)?.minutes_played).toBe(60);
  expect(rows.find((r) => r.shirt_number === 16)?.minutes_played).toBe(30);
  expect(rows.find((r) => r.shirt_number === 1)?.minutes_played).toBe(90);
  const events = await sql`select kind, minute from match_sheet_events where match_id = ${m.id} order by minute`;
  expect(events.map((e) => `${e.kind}@${e.minute}`)).toEqual(["substitution@60", "yellow_card@70"]);

  // The same sheet sent again (a retry after a lost reply) lands on the same rows.
  const status = await page.evaluate(async ({ id, team }) => {
    const store = JSON.parse(localStorage.getItem(`scout.sheet.${id}`) ?? "{}");
    const res = await fetch(`/api/matches/${id}/sheet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ team_id: team, sheet: store[team].sheet }) });
    return res.status;
  }, { id: m.id, team: m.home_id });
  expect(status).toBe(200);
  expect((await sql`select count(*)::int as n from match_sheet_events where match_id = ${m.id}`)[0].n).toBe(2);
  expect((await sql`select count(*)::int as n from lineups where match_id = ${m.id}`)[0].n).toBe(16);

  await page.reload();
  await expect(page.getByRole("main").getByText("Sent", { exact: true })).toBeVisible();
});

test("the sheet opens with no connection once it has been opened online", async ({ page, context }) => {
  await signIn(page, "coordinator@demo.scout");
  await page.goto(`/matches/${m.id}/sheet`);
  await expect(page.getByRole("heading", { name: "Line-up" })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => Boolean(await (await caches.open("scout-sheet-v1")).match(location.pathname)))).toBe(true);
  await context.setOffline(true);
  await page.goto(`/matches/${m.id}/sheet`);
  // shortcut: checks the page renders offline; under `next dev` it does not hydrate without the HMR socket, so the
  // offline interaction is covered by the test above on an open page. Check a reopened page against a production build.
  await expect(page.getByRole("heading", { name: "Line-up" })).toBeVisible();
  await expect(page.getByText("Joseph Mwila (demo)")).toBeVisible();
  await context.setOffline(false);
});
