import { test, expect } from "../../fixtures/test";
import { LogsPage } from "../../pages/logs.page";
import { buildIssueDrilldownScenario } from "../../mocks/scenarios/issue-drilldown";

test.describe("Logs SSE & Sort Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    await apiMock.install(buildIssueDrilldownScenario());
  });

  test("sort button is visible in view actions", async ({ page }) => {
    const logs = new LogsPage(page);
    await logs.navigateLiveLogs("SYM-42");
    await expect(logs.sortButton).toBeVisible({ timeout: 5000 });
  });

  test("clicking sort button toggles is-flipped class", async ({ page }) => {
    const logs = new LogsPage(page);
    await logs.navigateLiveLogs("SYM-42");
    await expect(logs.sortButton).toBeVisible({ timeout: 5000 });

    // Default: desc (not flipped)
    await expect(logs.sortButton).not.toHaveClass(/is-flipped/);

    // Click to toggle to asc
    await logs.sortButton.click();
    await expect(logs.sortButton).toHaveClass(/is-flipped/);

    // Click again to toggle back to desc
    await logs.sortButton.click();
    await expect(logs.sortButton).not.toHaveClass(/is-flipped/);
  });

  test("sort toggle reverses log row order", async ({ page }) => {
    const logs = new LogsPage(page);
    await logs.navigateLiveLogs("SYM-42");
    await expect(logs.logRows.first()).toBeVisible({ timeout: 5000 });

    // Get timestamps in default desc order
    const descTimestamps = await logs.logTimestamps.allTextContents();

    // Toggle to asc
    await logs.sortButton.click();
    await page.waitForTimeout(200);

    // Get timestamps in asc order
    const ascTimestamps = await logs.logTimestamps.allTextContents();

    // They should be reversed
    expect(ascTimestamps).toEqual([...descTimestamps].reverse());
  });

  test("synthetic SSE event appears without page refresh", async ({ page }) => {
    const logs = new LogsPage(page);
    await logs.navigateLiveLogs("SYM-42");
    await expect(logs.logRows.first()).toBeVisible({ timeout: 5000 });

    const initialCount = await logs.logRows.count();

    // Dispatch synthetic SSE event via CustomEvent
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("risoluto:any-event", {
          detail: {
            type: "agent.event",
            payload: {
              issueId: "issue-001",
              identifier: "SYM-42",
              type: "tool_use",
              message: "SSE live event arrived",
              sessionId: "sess-001",
              timestamp: "2026-01-15T12:05:00.000Z",
              content: null,
            },
          },
        }),
      );
    });

    // New event should appear
    await expect(page.getByText("SSE live event arrived")).toBeVisible({ timeout: 3000 });

    // Row count should increase
    const newCount = await logs.logRows.count();
    expect(newCount).toBeGreaterThan(initialCount);
  });
});
