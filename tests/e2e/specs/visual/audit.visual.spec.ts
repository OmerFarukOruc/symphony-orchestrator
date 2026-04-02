import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";

test.describe("Audit Log Visual Regression", () => {
  test("audit log with entries", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/audit");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("audit-log-entries.png", {
      fullPage: true,
    });
  });

  test("audit log empty state", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      routeOverrides: {
        "**/api/v1/audit*": (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ entries: [], total: 0 }),
          }),
      },
    });

    await page.goto("/audit");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("audit-log-empty.png", {
      fullPage: true,
    });
  });
});
