import { defineConfig, devices } from "@playwright/test";

// The tests share the demo match, so they run one at a time.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3007";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000, // generous: the dev server compiles routes on first use and is shared with other work
  globalTimeout: 9 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL, actionTimeout: 30_000, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: { command: `npx next dev -p ${new URL(baseURL).port || 3007}`, url: `${baseURL}/login`, reuseExistingServer: true, timeout: 180_000 },
});
