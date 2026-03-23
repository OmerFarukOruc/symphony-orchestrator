import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { screenshotCss } from "../../support/screenshot-css";

test.describe("Overview Visual Regression", () => {
  test("overview page with running issues", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);

    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await page.addStyleTag({ content: screenshotCss });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("overview-running.png", {
      fullPage: true,
    });
  });
});
