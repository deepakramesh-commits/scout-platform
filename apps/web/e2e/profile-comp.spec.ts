import { expect, test } from "@playwright/test";
import { signIn, sql } from "./fixtures";

// Regression: QA found that a hand-edited ?comp= made the profile crash with a database error.
test("a profile with an unknown competition in the link shows the player's own numbers", async ({ page }) => {
  const [p] = await sql`select p.id, p.display_name from players p join player_season_metrics m on m.player_id = p.id
                        where p.visible_to_scouts and not p.is_demo order by m.minutes desc limit 1`;
  await signIn(page, "scout@demo.scout");
  await page.goto(`/players/${p.id}?comp=bad`);
  await expect(page.getByRole("heading", { name: p.display_name })).toBeVisible();
  await page.goto(`/players/${p.id}/report/print?comp=bad`);
  await expect(page.getByRole("heading", { name: p.display_name })).toBeVisible();
});
