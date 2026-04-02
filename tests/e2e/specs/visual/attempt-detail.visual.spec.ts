import { test, expect } from "../../fixtures/test";
import { freezeClock } from "../../support/clock";
import { applyScreenshotStyles } from "../../support/screenshot-css";

test.describe("Attempt Detail Visual Regression", () => {
  test("successful attempt detail", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withAttemptRecord("att-success", {
        attemptId: "att-success",
        attemptNumber: 1,
        status: "completed",
        startedAt: "2026-01-15T10:00:00.000Z",
        endedAt: "2026-01-15T10:45:00.000Z",
        model: "o3-mini",
        reasoningEffort: "medium",
        tokenUsage: { inputTokens: 8000, outputTokens: 5000, totalTokens: 13000 },
        costUsd: 0.42,
        errorCode: null,
        errorMessage: null,
        issueIdentifier: "SYM-42",
        title: "Fix authentication bug",
        turnCount: 8,
        events: [
          {
            at: "2026-01-15T10:05:00.000Z",
            issue_id: "issue-001",
            issue_identifier: "SYM-42",
            session_id: "sess-001",
            event: "agent_started",
            message: "Agent started working",
            content: null,
          },
          {
            at: "2026-01-15T10:20:00.000Z",
            issue_id: "issue-001",
            issue_identifier: "SYM-42",
            session_id: "sess-001",
            event: "tool_call",
            message: "Called write_file on src/auth.ts",
            content: null,
          },
          {
            at: "2026-01-15T10:45:00.000Z",
            issue_id: "issue-001",
            issue_identifier: "SYM-42",
            session_id: "sess-001",
            event: "agent_completed",
            message: "Agent completed successfully",
            content: null,
          },
        ],
      })
      .build();
    await apiMock.install(scenario);

    await page.goto("/attempts/att-success");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("attempt-success.png", {
      fullPage: true,
    });
  });

  test("failed attempt detail", async ({ page, apiMock }) => {
    await freezeClock(page);
    const scenario = apiMock
      .scenario()
      .withSetupConfigured()
      .withAttemptRecord("att-failed", {
        attemptId: "att-failed",
        attemptNumber: 2,
        status: "failed",
        startedAt: "2026-01-15T11:00:00.000Z",
        endedAt: "2026-01-15T11:15:00.000Z",
        model: "o3-mini",
        reasoningEffort: "medium",
        tokenUsage: { inputTokens: 3000, outputTokens: 1500, totalTokens: 4500 },
        costUsd: 0.15,
        errorCode: "AGENT_ERROR",
        errorMessage: "Agent crashed during file write — permission denied on /etc/config",
        issueIdentifier: "SYM-42",
        title: "Fix authentication bug",
        turnCount: 3,
        events: [
          {
            at: "2026-01-15T11:00:00.000Z",
            issue_id: "issue-001",
            issue_identifier: "SYM-42",
            session_id: "sess-002",
            event: "agent_started",
            message: "Agent started attempt #2",
            content: null,
          },
          {
            at: "2026-01-15T11:15:00.000Z",
            issue_id: "issue-001",
            issue_identifier: "SYM-42",
            session_id: "sess-002",
            event: "agent_error",
            message: "Agent crashed during file write",
            content: null,
          },
        ],
      })
      .build();
    await apiMock.install(scenario);

    await page.goto("/attempts/att-failed");
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForFunction(() => {
      const outlet = document.getElementById("main-content");
      return outlet && outlet.children.length > 0;
    });

    await page.waitForTimeout(1000);
    await applyScreenshotStyles(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("attempt-failed.png", {
      fullPage: true,
    });
  });
});
