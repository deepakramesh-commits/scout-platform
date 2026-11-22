import { expect, test } from "@playwright/test";
import { PASSWORD } from "./fixtures";


test("a wrong password is refused and the right one signs in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coordinator@demo.scout");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/wrong|incorrect|not match/i).first()).toBeVisible();

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: "Matches" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Match sheet" })).toBeVisible();
});
