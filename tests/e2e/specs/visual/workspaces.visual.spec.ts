import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";

test.describe("Workspaces Visual Regression", () => {
  test("workspaces page default view", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/workspaces");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("workspaces-default.png", {
      fullPage: true,
    });
  });

  test("workspaces page with active workspaces", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      routeOverrides: {
        "**/api/v1/workspaces": (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              workspaces: [
                {
                  key: "ws-001",
                  path: "/tmp/workspaces/sym-42",
                  issueIdentifier: "SYM-42",
                  issueTitle: "Fix authentication bug",
                  status: "active",
                  createdAt: "2026-01-15T10:00:00.000Z",
                  lastUsedAt: "2026-01-15T12:00:00.000Z",
                  branchName: "sym-42-fix-auth",
                  sizeBytes: 52_428_800,
                },
                {
                  key: "ws-002",
                  path: "/tmp/workspaces/sym-43",
                  issueIdentifier: "SYM-43",
                  issueTitle: "Add rate limiting",
                  status: "idle",
                  createdAt: "2026-01-14T09:00:00.000Z",
                  lastUsedAt: "2026-01-14T18:00:00.000Z",
                  branchName: "sym-43-rate-limit",
                  sizeBytes: 31_457_280,
                },
              ],
              generated_at: "2026-01-15T12:00:00.000Z",
              total: 2,
              active: 1,
              orphaned: 0,
            }),
          }),
      },
    });

    await page.goto("/workspaces");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("workspaces-active.png", {
      fullPage: true,
    });
  });
});
