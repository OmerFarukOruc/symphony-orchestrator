import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { LogsPage } from "../../pages/logs.page";
import { buildIssueDrilldownScenario } from "../../mocks/scenarios/issue-drilldown";

/** Navigate to a path and wait for the SPA shell + page content to render. */
async function gotoAndWait(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForSelector("#main-content", { state: "attached", timeout: 10_000 });
  await page.waitForFunction(() => {
    const outlet = document.getElementById("main-content");
    return outlet && outlet.children.length > 0;
  });
}

test.describe("Logs Page & Attempt Detail Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    await apiMock.install(buildIssueDrilldownScenario());
  });

  // ── Logs Page ────────────────────────────────────────────────────────

  test("logs page loads via /issues/:id/logs with header and breadcrumb", async ({ page }) => {
    const logs = new LogsPage(page);
    await logs.navigateIssueLogs("SYM-42");

    await expect(logs.header).toBeVisible({ timeout: 5000 });
    await expect(logs.breadcrumb).toContainText("SYM-42", { timeout: 5000 });
  });

  test("logs page loads via /logs/:id in live mode", async ({ page }) => {
    const logs = new LogsPage(page);
    await logs.navigateLiveLogs("SYM-42");

    await expect(logs.header).toBeVisible({ timeout: 5000 });
    await expect(logs.breadcrumb).toContainText("SYM-42", { timeout: 5000 });
  });

  test("logs page renders filter controls and mode toggles", async ({ page }) => {
    const logs = new LogsPage(page);
    await logs.navigateIssueLogs("SYM-42");

    await expect(logs.controlBar).toBeVisible({ timeout: 5000 });
    await expect(logs.searchInput).toBeVisible({ timeout: 5000 });
    await expect(logs.liveButton).toBeVisible({ timeout: 5000 });
    await expect(logs.archiveButton).toBeVisible({ timeout: 5000 });
  });

  test("logs page shows recent events with log rows and timestamps", async ({ page }) => {
    const logs = new LogsPage(page);
    await logs.navigateLiveLogs("SYM-42");

    // The drilldown scenario has events: "Agent started attempt #2" and "Agent crashed during file write"
    await expect(page.getByText("Agent started attempt #2")).toBeVisible({ timeout: 5000 });

    // Log rows with timestamps should render
    await expect(logs.logRows.first()).toBeVisible({ timeout: 5000 });
    await expect(logs.logTimestamps.first()).toBeVisible({ timeout: 5000 });
  });

  test("logs page shows event type chips and view actions", async ({ page }) => {
    const logs = new LogsPage(page);
    await logs.navigateLiveLogs("SYM-42");

    // Should have at least the "All events" chip
    await expect(logs.typeChips.first()).toBeVisible({ timeout: 5000 });
    await expect(logs.typeChips.first()).toContainText("All events");

    // View actions (density, auto-scroll, expand, copy) should be visible
    await expect(logs.viewActions).toBeVisible({ timeout: 5000 });
  });

  // ── Runs Page ────────────────────────────────────────────────────────

  test("runs page loads and shows run history with attempts", async ({ page }) => {
    await gotoAndWait(page, "/issues/SYM-42/runs");

    // The drilldown scenario has 2 attempts
    await expect(page.getByText("Run History")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("#1").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("#2").first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking an attempt row shows attempt detail panel", async ({ page }) => {
    await gotoAndWait(page, "/issues/SYM-42/runs");

    // Click the first attempt row (#1 - failed attempt)
    const firstRow = page.locator(".runs-row").first();
    await expect(firstRow).toBeVisible({ timeout: 5000 });
    await firstRow.click();

    // The detail panel should show summary info
    await expect(page.locator(".runs-detail-panel").first()).toBeVisible({ timeout: 5000 });
  });

  // ── Attempt Detail ───────────────────────────────────────────────────

  test("attempt detail shows title, model, and token usage", async ({ page }) => {
    await gotoAndWait(page, "/attempts/att-002");

    // Issue title
    await expect(page.getByText("Fix authentication bug")).toBeVisible({ timeout: 5000 });
    // Model
    await expect(page.getByText("o3-mini").first()).toBeVisible({ timeout: 5000 });
    // Token usage (formatted with compact numbers)
    await expect(page.getByText(/total/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("attempt detail shows status and workspace metadata", async ({ page }) => {
    await gotoAndWait(page, "/attempts/att-002");

    // Status chip for the running attempt
    await expect(page.getByText("running").first()).toBeVisible({ timeout: 5000 });
    // Workspace path from the scenario
    await expect(page.getByText("/tmp/workspace/sym-42")).toBeVisible({ timeout: 5000 });
  });

  test("attempt detail has back navigation to issue", async ({ page }) => {
    await gotoAndWait(page, "/attempts/att-002");

    // Should show a "Back to SYM-42" button
    await expect(page.getByText(/Back to SYM-42/i)).toBeVisible({ timeout: 5000 });
  });
});
