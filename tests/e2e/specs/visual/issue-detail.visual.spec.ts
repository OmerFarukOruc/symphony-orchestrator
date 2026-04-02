import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";
import { buildAttemptSummary } from "../../mocks/data/attempts";

test.describe("Issue Detail Visual Regression", () => {
  test("issue detail running state", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withIssueDetail("SYM-42", {
        status: "running",
        state: "In Progress",
        attempt: 2,
        attempts: [
          buildAttemptSummary({
            attemptId: "att-001",
            attemptNumber: 1,
            status: "failed",
            startedAt: "2026-01-15T10:00:00.000Z",
            endedAt: "2026-01-15T10:30:00.000Z",
            errorCode: "AGENT_ERROR",
            errorMessage: "Agent crashed during file write",
          }),
          buildAttemptSummary({
            attemptId: "att-002",
            attemptNumber: 2,
            status: "running",
            startedAt: "2026-01-15T11:00:00.000Z",
            endedAt: null,
          }),
        ],
        currentAttemptId: "att-002",
      })
      .build();
    await apiMock.install(scenario);

    await page.goto("/issues/SYM-42");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("issue-detail-running.png", {
      fullPage: true,
    });
  });

  test("issue detail completed state", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withIssueDetail("SYM-41", {
        issueId: "issue-003",
        identifier: "SYM-41",
        title: "Update README docs",
        status: "completed",
        state: "Done",
        attempt: 1,
        error: null,
        labels: ["docs"],
        attempts: [
          buildAttemptSummary({
            attemptId: "att-done-001",
            attemptNumber: 1,
            status: "completed",
            startedAt: "2026-01-15T10:00:00.000Z",
            endedAt: "2026-01-15T10:45:00.000Z",
            tokenUsage: { inputTokens: 3000, outputTokens: 2000, totalTokens: 5000 },
          }),
        ],
        currentAttemptId: null,
      })
      .build();
    await apiMock.install(scenario);

    await page.goto("/issues/SYM-41");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("issue-detail-completed.png", {
      fullPage: true,
    });
  });
});
