import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";

test.describe("Empty States Visual Regression", () => {
  test("overview with zero issues", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withSnapshot({
        running: [],
        queued: [],
        retrying: [],
        completed: [],
        counts: { running: 0, retrying: 0 },
        workflow_columns: [
          { key: "backlog", label: "Backlog", kind: "backlog", terminal: false, count: 0, issues: [] },
          { key: "todo", label: "Todo", kind: "todo", terminal: false, count: 0, issues: [] },
          { key: "in_progress", label: "In Progress", kind: "active", terminal: false, count: 0, issues: [] },
          { key: "in_review", label: "In Review", kind: "gate", terminal: false, count: 0, issues: [] },
          { key: "done", label: "Done", kind: "terminal", terminal: true, count: 0, issues: [] },
          { key: "canceled", label: "Canceled", kind: "terminal", terminal: true, count: 0, issues: [] },
        ],
        recent_events: [],
        codex_totals: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          seconds_running: 0,
          cost_usd: 0,
        },
      })
      .build();
    await apiMock.install(scenario);

    await page.goto("/");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("overview-empty.png", {
      fullPage: true,
    });
  });

  test("queue with no items", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withSnapshot({
        running: [],
        queued: [],
        retrying: [],
        completed: [],
        counts: { running: 0, retrying: 0 },
        workflow_columns: [
          { key: "backlog", label: "Backlog", kind: "backlog", terminal: false, count: 0, issues: [] },
          { key: "todo", label: "Todo", kind: "todo", terminal: false, count: 0, issues: [] },
          { key: "in_progress", label: "In Progress", kind: "active", terminal: false, count: 0, issues: [] },
          { key: "in_review", label: "In Review", kind: "gate", terminal: false, count: 0, issues: [] },
          { key: "done", label: "Done", kind: "terminal", terminal: true, count: 0, issues: [] },
          { key: "canceled", label: "Canceled", kind: "terminal", terminal: true, count: 0, issues: [] },
        ],
        recent_events: [],
        codex_totals: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          seconds_running: 0,
          cost_usd: 0,
        },
      })
      .build();
    await apiMock.install(scenario);

    await page.goto("/queue");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("queue-empty.png", {
      fullPage: true,
    });
  });
});
