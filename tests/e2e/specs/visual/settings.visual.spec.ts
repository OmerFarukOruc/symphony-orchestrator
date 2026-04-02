import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";

test.describe("Settings Visual Regression", () => {
  test("settings general tab baseline", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/settings");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("settings-general.png", {
      fullPage: true,
    });
  });
});
