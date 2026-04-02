import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
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
        // Deterministic viewport for visual regression
        viewport: { width: 2560, height: 1440 },
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
