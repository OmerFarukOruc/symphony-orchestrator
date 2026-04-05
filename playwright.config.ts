import { defineConfig, devices } from "@playwright/test";

// oh-my-anvil adoption: honor ANVIL_FRONTEND_PORT so parallel factory runs
// don't collide on 5173. Visual regression viewport also env-driven so the
// 2560x1440 mandate from the verify battery applies per-run without a code
// change.
const PORT = Number(process.env.ANVIL_FRONTEND_PORT ?? 5173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const VISUAL_VIEWPORT_WIDTH = Number(process.env.ANVIL_VISUAL_VIEWPORT_WIDTH ?? 2560);
const VISUAL_VIEWPORT_HEIGHT = Number(process.env.ANVIL_VISUAL_VIEWPORT_HEIGHT ?? 1440);
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e/specs",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? "50%" : undefined,
  reporter: isCI ? [["blob"], ["github"]] : [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "smoke",
      testMatch: ["**/*.smoke.spec.ts", "**/*.spec.ts"],
      testIgnore: ["**/*.visual.spec.ts", "**/*.fullstack.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "visual",
      testMatch: ["**/*.visual.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        // Deterministic viewport for visual regression. 2560x1440 by default
        // (matches Omer's review resolution). Override per-run via
        // ANVIL_VISUAL_VIEWPORT_WIDTH / ANVIL_VISUAL_VIEWPORT_HEIGHT.
        viewport: { width: VISUAL_VIEWPORT_WIDTH, height: VISUAL_VIEWPORT_HEIGHT },
      },
    },
  ],

  webServer: {
    command: `pnpm exec vite --config frontend/vite.config.ts --port ${PORT} --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },

  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },
});
