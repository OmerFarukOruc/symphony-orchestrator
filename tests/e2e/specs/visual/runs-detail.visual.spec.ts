import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";
import { buildIssueDrilldownScenario } from "../../mocks/scenarios/issue-drilldown";

test.describe("Runs Detail Visual Regression", () => {
  test("runs drawer shows app-server summary", async ({ page, apiMock }) => {
    await freezeClock(page);
    await apiMock.install(buildIssueDrilldownScenario());

    await page.goto("/issues/SYM-42/runs");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });
    await expect(page.getByText("cliproxyapi · active")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Requirements: Approval: never/i)).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("runs-detail-app-server.png", {
      fullPage: true,
    });
  });
});
