import { test, expect } from "../../fixtures/test";
import { QueuePage } from "../../pages/queue.page";
import { AppShellPage } from "../../pages/app-shell.page";
import { freezeClock } from "../../support/clock";

test.describe("Queue / Issue Smoke", () => {
  test.beforeEach(async ({ apiMock }) => {
    const scenario = apiMock.scenario().withSetupConfigured().build();
    await apiMock.install(scenario);
  });

  test("queue page loads with kanban board", async ({ page }) => {
    const queue = new QueuePage(page);
    await queue.navigate();

    await expect(queue.board).toBeVisible({ timeout: 5000 });
  });

  test("kanban board shows workflow columns", async ({ page }) => {
    const queue = new QueuePage(page);
    await queue.navigate();

    // Mock provides 5 columns: Backlog, Todo, In Progress, Done, Canceled
    await expect(queue.columnByLabel("Todo")).toBeVisible({ timeout: 5000 });
    await expect(queue.columnByLabel("In Progress")).toBeVisible({ timeout: 5000 });
    await expect(queue.columnByLabel("Done")).toBeVisible({ timeout: 5000 });
  });

  test("kanban shows issue cards with identifiers", async ({ page }) => {
    const queue = new QueuePage(page);
    await queue.navigate();

    // Mock provides SYM-42 (running), SYM-43 (queued), SYM-41 (completed)
    await expect(page.getByText("SYM-42")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("SYM-43")).toBeVisible({ timeout: 5000 });
  });

  test("issue card footer separates token usage from relative time", async ({ page }) => {
    await freezeClock(page);

    const queue = new QueuePage(page);
    await queue.navigate();

    await expect(queue.issueCardByIdentifier("SYM-42")).toContainText(/8k tokens\s+just now/);
  });

  test("clicking issue card navigates to issue detail", async ({ page }) => {
    const queue = new QueuePage(page);
    await queue.navigate();

    // Click on SYM-42
    await page.getByText("SYM-42").first().click();

    // Should navigate to an issue-related path
    await page.waitForFunction(
      () => window.location.pathname.includes("SYM-42") || window.location.pathname.includes("queue/SYM-42"),
      null,
      { timeout: 5000 },
    );

    const path = new URL(page.url()).pathname;
    expect(path).toContain("SYM-42");
  });

  test("sidebar shows active state for queue page", async ({ page }) => {
    const shell = new AppShellPage(page);
    const queue = new QueuePage(page);
    await queue.navigate();

    const queueItem = shell.sidebarItemByPath("/queue");
    await expect(queueItem).toHaveClass(/is-active/);
  });

  test("navigating from queue back to overview works", async ({ page }) => {
    const queue = new QueuePage(page);
    const shell = new AppShellPage(page);
    await queue.navigate();

    // Navigate back to overview via sidebar
    await shell.gotoOverview();

    const path = new URL(page.url()).pathname;
    expect(path).toBe("/");
  });
});
