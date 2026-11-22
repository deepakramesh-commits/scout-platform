import { expect, test } from "@playwright/test";
import { signIn, sql } from "./fixtures";

let list: string;
test.beforeAll(async () => {
  const [{ id }] = await sql`insert into playlists (owner_id, name)
                             select id, 'E2E id check' from app_users where email = 'scout@demo.scout' returning id`;
  list = id;
  await sql`insert into playlist_items (playlist_id, event_id, position)
            select ${list}, e.id, 1 from events e join matches m on m.id = e.match_id where not m.is_demo limit 1`;
});
test.afterAll(async () => { await sql`delete from playlists where id = ${list}`; });

// Regression: QA found that a hand-edited playlist or action id reached SQL and showed the error page.
test("a playlist form with a broken id says so instead of failing", async ({ page }) => {
  await signIn(page, "scout@demo.scout");
  await page.goto(`/playlists?list=${list}`);
  const cases = [["Rename", "list", "Choose a playlist."], ["Delete playlist", "list", "Choose a playlist."],
                 ["Remove", "event", "Choose an action."], ["Save note", "event", "Choose an action."]] as const;
  for (const [button, field, message] of cases) {
    const form = page.locator("form", { has: page.getByRole("button", { name: button, exact: true }) });
    await form.locator(`input[name=${field}]`).evaluate((el: HTMLInputElement) => { el.value = "not-an-id"; });
    await form.getByRole("button", { name: button, exact: true }).click();
    await expect(form.getByText(message)).toBeVisible();
  }
  expect((await sql`select count(*)::int as n from playlist_items where playlist_id = ${list}`)[0].n).toBe(1);
});
