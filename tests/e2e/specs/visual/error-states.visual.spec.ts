import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";

test.describe("Error States Visual Regression", () => {
  test("404 unknown issue page", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/issues/NONEXISTENT-999");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("error-404-issue.png", {
      fullPage: true,
    });
  });

  test("API error on state endpoint", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      routeOverrides: {
        "**/api/v1/state": (route) =>
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "internal", message: "Database connection lost" } }),
          }),
      },
    });

    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("error-api-500.png", {
      fullPage: true,
    });
  });

  test("connection timeout on state endpoint", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      routeOverrides: {
        "**/api/v1/state": (route) => route.abort("timedout"),
      },
    });

    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("error-timeout.png", {
      fullPage: true,
    });
  });
});
