import { test, expect } from "../../fixtures/test";
import { AppShellPage } from "../../pages/app-shell.page";

test.describe("Notifications Smoke", () => {
  test.beforeEach(async ({ page, apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install({
      ...scenario,
      notifications: {
        notifications: [
          {
            id: "notif-1",
            type: "worker_failed",
            severity: "critical",
            title: "Worker failed",
            message: "ENG-1 crashed during review",
            source: "ENG-1",
            href: null,
            read: false,
            dedupeKey: "notif-1",
            metadata: { issueIdentifier: "ENG-1" },
            deliverySummary: {
              deliveredChannels: ["slack"],
              failedChannels: [],
              skippedDuplicate: false,
            },
            createdAt: "2026-04-04T09:00:00.000Z",
            updatedAt: "2026-04-04T09:00:00.000Z",
          },
        ],
        unreadCount: 1,
        totalCount: 1,
      },
    });
    await page.goto("/notifications");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => document.body.textContent?.includes("Worker failed") === true);
  });

  test("renders the persisted notification timeline", async ({ page }) => {
    await expect(page.getByText("Worker failed")).toBeVisible();
    await expect(page.getByText("ENG-1 crashed during review")).toBeVisible();
    await expect(page.locator(".mc-stat-card-label").filter({ hasText: "Unread" })).toBeVisible();
  });

  test("marks the notifications sidebar item active", async ({ page }) => {
    const shell = new AppShellPage(page);
    await expect(shell.sidebarItemByPath("/notifications")).toHaveClass(/is-active/);
  });
});
