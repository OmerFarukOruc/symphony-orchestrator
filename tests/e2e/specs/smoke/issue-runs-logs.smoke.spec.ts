import { test, expect } from "../../fixtures/test";
import { IssuePage } from "../../pages/issue.page";
import { buildIssueDrilldownScenario } from "../../mocks/scenarios/issue-drilldown";

test.describe("Issue Runs & Logs Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    await apiMock.install(buildIssueDrilldownScenario());
  });

  test("issue detail page loads with title", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    // The page should display the issue title
    await expect(page.getByText("Fix authentication bug")).toBeVisible({ timeout: 5000 });
  });

  test("issue detail shows identifier", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    await expect(page.getByText("SYM-42", { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test("issue detail shows model information", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    await expect(page.getByText("o3-mini").first()).toBeVisible({ timeout: 5000 });
  });

  test("issue detail shows recent events", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    // The drilldown scenario includes events
    await expect(page.getByText("Agent started attempt #2")).toBeVisible({ timeout: 5000 });
  });

  test("navigating to runs tab shows attempts", async ({ page }) => {
    // Navigate to the runs view for SYM-42
    await page.goto("/issues/SYM-42/runs");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    // Should show attempt entries
    // The scenario has 2 attempts: one failed, one running
    await expect(page.getByText(/attempt|run/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("issue description is visible", async ({ page }) => {
    const issue = new IssuePage(page);
    await issue.navigate("SYM-42");

    await expect(page.getByText("Users cannot log in after password reset")).toBeVisible({ timeout: 5000 });
  });
});
