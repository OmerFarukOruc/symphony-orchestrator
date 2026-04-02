/**
 * Playwright config for fullstack E2E tests.
 *
 * Separate from `playwright.config.ts` because the main config has an
 * unconditional top-level `webServer` that starts a Vite dev server.
 * Fullstack tests need the real backend + built frontend, managed by
 * the global setup in `tests/e2e/setup/fullstack-server.ts`.
 *
 * Run with: pnpm exec playwright test --config playwright.fullstack.config.ts
 */

import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e/specs",
  testMatch: ["**/*.fullstack.spec.ts"],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? "50%" : undefined,
  reporter: isCI ? [["blob"], ["github"]] : [["html", { open: "never" }], ["list"]],

  globalSetup: "./tests/e2e/setup/fullstack-server.ts",

  use: {
    /* baseURL is set dynamically by global setup via FULLSTACK_BASE_URL */
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "fullstack",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* No webServer — the real backend is started by globalSetup */
});
