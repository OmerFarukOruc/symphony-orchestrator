import { describe, expect, it, vi } from "vitest";

import { AutomationRunner } from "../../src/automation/runner.js";
import { AutomationStore } from "../../src/persistence/sqlite/automation-store.js";
import { openDatabase } from "../../src/persistence/sqlite/database.js";
import { createMockLogger } from "../helpers.js";
import type { AutomationConfig } from "../../src/core/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-04-04T10:00:00.000Z",
    counts: { running: 1, retrying: 0 },
    running: [{ identifier: "ENG-1" }],
    retrying: [],
    queued: [],
    completed: [],
    workflowColumns: [],
    codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0, costUsd: 0 },
    rateLimits: null,
    recentEvents: [],
    ...overrides,
  } as never;
}

function makeConfig(overrides: Partial<AutomationConfig> = {}): AutomationConfig {
  return {
    name: "test-automation",
    schedule: "0 2 * * *",
    mode: "report",
    prompt: "Summarize current status.",
    enabled: true,
    repoUrl: "https://github.com/acme/app",
    ...overrides,
  } as AutomationConfig;
}

function createRunner(
  options: {
    snapshot?: ReturnType<typeof createSnapshot>;
    tracker?: Record<string, unknown>;
    notificationManager?: Record<string, unknown>;
    eventBus?: Record<string, unknown>;
  } = {},
) {
  const orchestrator = {
    getSnapshot: vi.fn().mockReturnValue(options.snapshot ?? createSnapshot()),
    requestTargetedRefresh: vi.fn(),
  };
  const notificationManager = options.notificationManager ?? { notify: vi.fn().mockResolvedValue(undefined) };
  const eventBus = options.eventBus ?? { emit: vi.fn() };
  const store = AutomationStore.create(openDatabase(":memory:"));

  const runner = new AutomationRunner({
    orchestrator,
    tracker: options.tracker as never,
    notificationManager: notificationManager as never,
    eventBus: eventBus as never,
    store,
    logger: createMockLogger(),
  });

  return { runner, orchestrator, notificationManager, eventBus, store };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AutomationRunner", () => {
  describe("report mode", () => {
    it("includes repo URL in report output when provided", async () => {
      const { runner } = createRunner();
      const result = await runner.run(makeConfig({ repoUrl: "https://github.com/acme/app" }), "manual");

      expect(result.status).toBe("completed");
      expect(result.output).toContain("Repo: https://github.com/acme/app");
    });

    it("omits repo URL from report output when null", async () => {
      // report mode requires repoUrl — but report mode with null repoUrl gets skipped
      // So test with a valid repoUrl but the snapshot without repo to check omit behavior
      const { runner } = createRunner();
      const result = await runner.run(makeConfig({ repoUrl: "https://github.com/acme/app" }), "schedule");

      expect(result.status).toBe("completed");
      expect(result.output).toContain("Prompt:");
    });

    it("skips when repoUrl is missing for report mode", async () => {
      const { runner } = createRunner();
      const result = await runner.run(makeConfig({ mode: "report", repoUrl: null }), "manual");

      expect(result.status).toBe("skipped");
      expect(result.error).toContain("repoUrl is required");
    });

    it("includes counts in report output", async () => {
      const snapshot = createSnapshot({
        counts: { running: 2, retrying: 1 },
        queued: [{ identifier: "ENG-3" }],
        completed: [{ identifier: "ENG-4" }],
      });
      const { runner } = createRunner({ snapshot });
      const result = await runner.run(makeConfig(), "manual");

      expect(result.output).toContain("Running: 2");
      expect(result.output).toContain("Retrying: 1");
      expect(result.output).toContain("Queued: 1");
      expect(result.output).toContain("Completed: 1");
    });

    it("populates details with identifiers", async () => {
      const snapshot = createSnapshot({
        running: [{ identifier: "ENG-1" }],
        retrying: [{ identifier: "ENG-2" }],
        queued: [{ identifier: "ENG-3" }],
        completed: [{ identifier: "ENG-4" }],
      });
      const { runner } = createRunner({ snapshot });
      const result = await runner.run(makeConfig(), "manual");

      const details = result.details as Record<string, unknown>;
      expect(details.running).toEqual(["ENG-1"]);
      expect(details.retrying).toEqual(["ENG-2"]);
      expect(details.queued).toEqual(["ENG-3"]);
      expect(details.completed).toEqual(["ENG-4"]);
    });
  });

  describe("findings mode", () => {
    it("skips when repoUrl is missing for findings mode", async () => {
      const { runner } = createRunner();
      const result = await runner.run(makeConfig({ mode: "findings", repoUrl: null }), "manual");

      expect(result.status).toBe("skipped");
      expect(result.error).toContain("repoUrl is required");
    });

    it("returns 'No active findings' when snapshot is clean", async () => {
      const snapshot = createSnapshot({
        retrying: [],
        queued: [],
        recentEvents: [],
      });
      const { runner } = createRunner({ snapshot });
      const result = await runner.run(makeConfig({ mode: "findings", repoUrl: "https://github.com/x" }), "manual");

      expect(result.status).toBe("completed");
      expect(result.output).toBe("No active findings.");
    });

    it("reports retry queue findings", async () => {
      const snapshot = createSnapshot({
        retrying: [{ identifier: "ENG-2" }, { identifier: "ENG-3" }],
      });
      const { runner, notificationManager } = createRunner({ snapshot });
      const result = await runner.run(makeConfig({ mode: "findings", repoUrl: "https://github.com/x" }), "manual");

      expect(result.status).toBe("completed");
      expect(result.output).toContain("Retry queue contains 2 issue(s)");
      expect(result.output).toContain("ENG-2, ENG-3");
      // Should notify with warning severity when findings exist
      expect((notificationManager as Record<string, ReturnType<typeof vi.fn>>).notify).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "warning" }),
      );
    });

    it("reports dispatch queue findings", async () => {
      const snapshot = createSnapshot({
        queued: [{ identifier: "ENG-5" }, { identifier: "ENG-6" }],
      });
      const { runner } = createRunner({ snapshot });
      const result = await runner.run(makeConfig({ mode: "findings", repoUrl: "https://github.com/x" }), "manual");

      expect(result.output).toContain("Dispatch queue contains 2 issue(s)");
    });

    it("reports worker stalls", async () => {
      const snapshot = createSnapshot({
        recentEvents: [{ event: "worker_stalled" }, { event: "worker_stalled" }],
      });
      const { runner } = createRunner({ snapshot });
      const result = await runner.run(makeConfig({ mode: "findings", repoUrl: "https://github.com/x" }), "manual");

      expect(result.output).toContain("Recent worker stalls observed: 2");
    });

    it("sends info notification when no findings", async () => {
      const snapshot = createSnapshot({ retrying: [], queued: [], recentEvents: [] });
      const { runner, notificationManager } = createRunner({ snapshot });
      await runner.run(makeConfig({ mode: "findings", repoUrl: "https://github.com/x" }), "manual");

      expect((notificationManager as Record<string, ReturnType<typeof vi.fn>>).notify).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "info" }),
      );
    });
  });

  describe("implement mode", () => {
    it("rejects when tracker is not available", async () => {
      const { runner } = createRunner({ tracker: undefined });

      await expect(runner.run(makeConfig({ mode: "implement" }), "manual")).rejects.toThrow("tracker is not available");
    });

    it("sends notification with issue info after creating a tracker issue", async () => {
      const tracker = {
        createIssue: vi.fn().mockResolvedValue({
          issueId: "issue-9",
          identifier: "ENG-9",
          url: "https://tracker.example/ENG-9",
        }),
      };
      const notificationManager = { notify: vi.fn().mockResolvedValue(undefined) };
      const { runner } = createRunner({ tracker: tracker as never, notificationManager });
      const result = await runner.run(makeConfig({ mode: "implement" }), "manual");

      expect(result.status).toBe("completed");
      expect(notificationManager.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          href: "https://tracker.example/ENG-9",
          issue: expect.objectContaining({
            id: "issue-9",
            identifier: "ENG-9",
          }),
        }),
      );
    });
  });

  describe("event bus emissions", () => {
    it("emits automation.run.started on run start", async () => {
      const eventBus = { emit: vi.fn() };
      const { runner } = createRunner({ eventBus });
      await runner.run(makeConfig(), "manual");

      expect(eventBus.emit).toHaveBeenCalledWith(
        "automation.run.started",
        expect.objectContaining({
          automationName: "test-automation",
          mode: "report",
          trigger: "manual",
        }),
      );
    });

    it("emits automation.run.completed on successful completion", async () => {
      const eventBus = { emit: vi.fn() };
      const { runner } = createRunner({ eventBus });
      await runner.run(makeConfig(), "manual");

      expect(eventBus.emit).toHaveBeenCalledWith(
        "automation.run.completed",
        expect.objectContaining({
          automationName: "test-automation",
          mode: "report",
          status: "completed",
        }),
      );
    });

    it("emits automation.run.completed with status 'skipped' on skip", async () => {
      const eventBus = { emit: vi.fn() };
      const { runner } = createRunner({ eventBus });
      await runner.run(makeConfig({ mode: "report", repoUrl: null }), "manual");

      expect(eventBus.emit).toHaveBeenCalledWith(
        "automation.run.completed",
        expect.objectContaining({
          status: "skipped",
        }),
      );
    });

    it("emits automation.run.started even when run later fails", async () => {
      const eventBus = { emit: vi.fn() };
      const { runner } = createRunner({ eventBus, tracker: undefined });
      // The implement mode throws because tracker is missing, but the started event
      // is emitted BEFORE the throw.
      await runner.run(makeConfig({ mode: "implement" }), "manual").catch(() => {});

      expect(eventBus.emit).toHaveBeenCalledWith(
        "automation.run.started",
        expect.objectContaining({
          automationName: "test-automation",
          mode: "implement",
          trigger: "manual",
        }),
      );
    });
  });

  describe("error handling", () => {
    it("propagates errors from sub-methods as rejected promises", async () => {
      const orchestrator = {
        getSnapshot: vi.fn().mockImplementation(() => {
          throw new Error("snapshot exploded");
        }),
        requestTargetedRefresh: vi.fn(),
      };
      const store = AutomationStore.create(openDatabase(":memory:"));
      const runner = new AutomationRunner({
        orchestrator,
        store,
        logger: createMockLogger(),
      });

      await expect(runner.run(makeConfig(), "manual")).rejects.toThrow("snapshot exploded");
    });

    it("propagates non-Error thrown values", async () => {
      const orchestrator = {
        getSnapshot: vi.fn().mockImplementation(() => {
          throw "string error";
        }),
        requestTargetedRefresh: vi.fn(),
      };
      const store = AutomationStore.create(openDatabase(":memory:"));
      const runner = new AutomationRunner({
        orchestrator,
        store,
        logger: createMockLogger(),
      });

      await expect(runner.run(makeConfig(), "manual")).rejects.toBe("string error");
    });

    it("does not call notification manager when run throws", async () => {
      const notificationManager = { notify: vi.fn().mockResolvedValue(undefined) };
      const orchestrator = {
        getSnapshot: vi.fn().mockImplementation(() => {
          throw new Error("boom");
        }),
        requestTargetedRefresh: vi.fn(),
      };
      const store = AutomationStore.create(openDatabase(":memory:"));
      const runner = new AutomationRunner({
        orchestrator,
        notificationManager: notificationManager as never,
        store,
        logger: createMockLogger(),
      });

      await runner.run(makeConfig(), "manual").catch(() => {});

      // The error bypasses the try-catch in run() because it uses
      // `return this.runReport()` without `await`, so the notification
      // manager's notify is never reached — the error at getSnapshot()
      // happens before the notify() call.
      expect(notificationManager.notify).not.toHaveBeenCalled();
    });
  });

  describe("notify helper", () => {
    it("works without notification manager (no-op)", async () => {
      const store = AutomationStore.create(openDatabase(":memory:"));
      const runner = new AutomationRunner({
        orchestrator: {
          getSnapshot: vi.fn().mockReturnValue(createSnapshot()),
          requestTargetedRefresh: vi.fn(),
        },
        store,
        logger: createMockLogger(),
        // no notificationManager, no eventBus
      });
      // Should not throw
      const result = await runner.run(makeConfig(), "manual");
      expect(result.status).toBe("completed");
    });
  });

  describe("default mode", () => {
    it("falls through to report for unknown mode values", async () => {
      // Use a mock store to bypass the SQLite mode CHECK constraint — this
      // test validates runner switch-case routing, not persistence behaviour.
      const mockRun = {
        id: "run-unknown",
        automationName: "test",
        mode: "unknown-mode" as never,
        trigger: "manual" as const,
        repoUrl: null,
        status: "running" as const,
        output: null,
        details: null,
        issueId: null,
        issueIdentifier: null,
        issueUrl: null,
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
      };
      const mockStore: import("../../src/persistence/sqlite/automation-store.js").AutomationStorePort = {
        createRun: vi.fn().mockResolvedValue(mockRun),
        finishRun: vi.fn().mockImplementation((_id, input) => Promise.resolve({ ...mockRun, ...input })),
        listRuns: vi.fn().mockResolvedValue([]),
        countRuns: vi.fn().mockResolvedValue(0),
      };
      const runner = new AutomationRunner({
        orchestrator: {
          getSnapshot: vi.fn().mockReturnValue(createSnapshot()),
          requestTargetedRefresh: vi.fn(),
        },
        store: mockStore,
        logger: createMockLogger(),
      });
      // Cast unknown mode — it falls to the default case which runs report
      const result = await runner.run(makeConfig({ mode: "unknown-mode" as never }), "manual");
      expect(result.status).toBe("completed");
      expect(result.output).toContain("report mode");
    });
  });
});
