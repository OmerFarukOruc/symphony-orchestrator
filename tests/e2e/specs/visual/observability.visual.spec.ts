import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";

test.describe("Observability Visual Regression", () => {
  test("observability page with healthy system", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/observability");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("observability-healthy.png", {
      fullPage: true,
    });
  });

  test("observability page with degraded health", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withSnapshot({
        system_health: {
          status: "degraded",
          checked_at: "2026-01-15T12:00:00.000Z",
          running_count: 1,
          message: "High memory usage detected",
        },
      })
      .build();
    await apiMock.install(scenario);

    await page.goto("/observability");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("observability-degraded.png", {
      fullPage: true,
    });
  });
});
