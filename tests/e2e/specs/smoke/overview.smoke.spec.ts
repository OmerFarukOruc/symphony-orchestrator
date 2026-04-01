import { test, expect } from "../../fixtures/test";
import { OverviewPage } from "../../pages/overview.page";
import { AppShellPage } from "../../pages/app-shell.page";

test.describe("Overview Smoke", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });
  });

  test("renders metric status bar with running and queue counts", async ({ page }) => {
    const overview = new OverviewPage(page);
    await expect(overview.runningCount).toBeVisible({ timeout: 5000 });
    await expect(overview.queueCount).toBeVisible({ timeout: 5000 });
  });

  test("shows attention section with issue cards", async ({ page }) => {
    const overview = new OverviewPage(page);
    await expect(overview.attentionSection).toBeVisible({ timeout: 5000 });
  });

  test("shows token burn session totals", async ({ page }) => {
    const overview = new OverviewPage(page);
    await expect(overview.tokenBurnSection).toBeVisible({ timeout: 5000 });
    // Verify token counts from the mock (15K input, 8K output, 23K total)
    await expect(page.getByText("15K")).toBeVisible();
    await expect(page.getByText("8K")).toBeVisible();
    await expect(page.getByText("23K")).toBeVisible();
  });

  test("shows recent events section", async ({ page }) => {
    const overview = new OverviewPage(page);
    await expect(overview.recentEventsSection).toBeVisible({ timeout: 5000 });
  });

  test("shows system health section", async ({ page }) => {
    const overview = new OverviewPage(page);
    await expect(overview.systemHealthSection).toBeVisible({ timeout: 5000 });
  });

  test("shows recently finished section", async ({ page }) => {
    await expect(page.getByText("Recently finished")).toBeVisible({ timeout: 5000 });
  });

  test("sidebar shows correct active state for overview", async ({ page }) => {
    const shell = new AppShellPage(page);
    const overviewItem = shell.sidebarItemByPath("/");
    await expect(overviewItem).toHaveClass(/is-active/);
  });

  test("navigating via sidebar updates active state", async ({ page }) => {
    const shell = new AppShellPage(page);

    // Navigate to /queue via sidebar
    await shell.navigateViaSidebar("/queue");

    // Queue sidebar item should now be active
    const queueItem = shell.sidebarItemByPath("/queue");
    await expect(queueItem).toHaveClass(/is-active/);

    // Overview should no longer be active
    const overviewItem = shell.sidebarItemByPath("/");
    await expect(overviewItem).not.toHaveClass(/is-active/);
  });
});
