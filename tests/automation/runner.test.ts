import { describe, expect, it, vi } from "vitest";

import { AutomationRunner } from "../../src/automation/runner.js";
import { AutomationStore } from "../../src/persistence/sqlite/automation-store.js";
import { createMockLogger } from "../helpers.js";

function createSnapshot() {
  return {
    generatedAt: "2026-04-04T10:00:00.000Z",
    counts: { running: 1, retrying: 1 },
    running: [{ identifier: "ENG-1" }],
    retrying: [{ identifier: "ENG-2" }],
    queued: [{ identifier: "ENG-3" }],
    completed: [{ identifier: "ENG-4" }],
    workflowColumns: [],
    codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0, costUsd: 0 },
    rateLimits: null,
    recentEvents: [{ event: "worker_stalled" }],
  } as never;
}

describe("AutomationRunner", () => {
  it("produces a persisted report run when repo binding is present", async () => {
    const notificationManager = { notify: vi.fn().mockResolvedValue(undefined) };
    const runner = new AutomationRunner({
      orchestrator: {
        getSnapshot: vi.fn().mockReturnValue(createSnapshot()),
        requestTargetedRefresh: vi.fn(),
      },
      notificationManager: notificationManager as never,
      store: AutomationStore.create(null),
      logger: createMockLogger(),
    });

    const result = await runner.run(
      {
        name: "nightly-report",
        schedule: "0 2 * * *",
        mode: "report",
        prompt: "Summarize current status.",
        enabled: true,
        repoUrl: "https://github.com/acme/app",
      },
      "manual",
    );

    expect(result.status).toBe("completed");
    expect(result.output).toContain("Automation nightly-report ran in report mode.");
    expect(notificationManager.notify).toHaveBeenCalled();
  });

  it("skips tracker-free report runs without repo binding", async () => {
    const runner = new AutomationRunner({
      orchestrator: {
        getSnapshot: vi.fn().mockReturnValue(createSnapshot()),
        requestTargetedRefresh: vi.fn(),
      },
      store: AutomationStore.create(null),
      logger: createMockLogger(),
    });

    const result = await runner.run(
      {
        name: "missing-repo",
        schedule: "0 2 * * *",
        mode: "report",
        prompt: "Summarize current status.",
        enabled: true,
        repoUrl: null,
      },
      "manual",
    );

    expect(result.status).toBe("skipped");
    expect(result.error).toContain("repoUrl is required");
  });

  it("creates tracker issues for implement runs and requests a targeted refresh", async () => {
    const tracker = {
      createIssue: vi.fn().mockResolvedValue({
        issueId: "issue-7",
        identifier: "ENG-7",
        url: "https://tracker.example/issues/ENG-7",
      }),
    };
    const orchestrator = {
      getSnapshot: vi.fn().mockReturnValue(createSnapshot()),
      requestTargetedRefresh: vi.fn(),
    };
    const runner = new AutomationRunner({
      orchestrator,
      tracker: tracker as never,
      store: AutomationStore.create(null),
      logger: createMockLogger(),
    });

    const result = await runner.run(
      {
        name: "dispatch-implementer",
        schedule: "0 3 * * *",
        mode: "implement",
        prompt: "Create work for the deploy regression.",
        enabled: true,
        repoUrl: null,
      },
      "schedule",
    );

    expect(tracker.createIssue).toHaveBeenCalled();
    expect(orchestrator.requestTargetedRefresh).toHaveBeenCalledWith(
      "issue-7",
      "ENG-7",
      "automation:dispatch-implementer",
    );
    expect(result.issueIdentifier).toBe("ENG-7");
    expect(result.status).toBe("completed");
  });
});
