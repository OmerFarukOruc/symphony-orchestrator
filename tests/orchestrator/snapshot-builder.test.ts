import { describe, expect, it, vi } from "vitest";

import type { AttemptRecord, RecentEvent, RuntimeIssueView, ServiceConfig } from "../../src/core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "../../src/orchestrator/runtime-types.js";
import {
  buildSnapshot,
  buildIssueDetail,
  buildAttemptDetail,
  buildRunningIssueView,
  buildRetryIssueView,
  computeSecondsRunning,
  type SnapshotBuilderDeps,
  type SnapshotBuilderCallbacks,
} from "../../src/orchestrator/snapshot-builder.js";

function createIssue(overrides?: Partial<RunningEntry["issue"]>): RunningEntry["issue"] {
  return {
    id: "issue-1",
    identifier: "MT-42",
    title: "Test Issue",
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-16T00:00:00Z",
    ...overrides,
  };
}

function createWorkspace(overrides?: Partial<RunningEntry["workspace"]>): RunningEntry["workspace"] {
  return {
    path: "/tmp/symphony/MT-42",
    workspaceKey: "MT-42",
    createdNow: true,
    ...overrides,
  };
}

function createModelSelection(): RunningEntry["modelSelection"] {
  return {
    model: "gpt-5.4",
    reasoningEffort: "high",
    source: "default",
  };
}

function createRunningEntry(overrides?: Partial<RunningEntry>): RunningEntry {
  const now = Date.now();
  return {
    runId: "run-1",
    issue: createIssue(),
    workspace: createWorkspace(),
    startedAtMs: now - 60000,
    lastEventAtMs: now - 30000,
    attempt: 1,
    abortController: new AbortController(),
    promise: Promise.resolve(),
    cleanupOnExit: false,
    status: "running",
    sessionId: "session-1",
    tokenUsage: null,
    modelSelection: createModelSelection(),
    lastAgentMessageContent: null,
    repoMatch: null,
    queuePersistence: () => undefined,
    flushPersistence: async () => undefined,
    ...overrides,
  } as RunningEntry;
}

function createRetryEntry(overrides?: Partial<RetryRuntimeEntry>): RetryRuntimeEntry {
  const now = Date.now();
  return {
    issueId: "issue-1",
    identifier: "MT-43",
    attempt: 2,
    dueAtMs: now + 30000,
    error: "turn_failed",
    timer: null,
    issue: createIssue({ id: "issue-1", identifier: "MT-43" }),
    workspaceKey: "MT-43",
    ...overrides,
  } as RetryRuntimeEntry;
}

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Completed", "Canceled", "Cancelled", "Duplicate"],
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/symphony",
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1000,
      },
    },
    agent: {
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: {},
      maxTurns: 1,
      maxRetryBackoffMs: 300000,
    },
    codex: {
      command: "codex app-server",
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 5000,
      stallTimeoutMs: 10000,
      auth: {
        mode: "api_key",
        sourceHome: "/tmp/unused-codex-home",
      },
      provider: null,
      sandbox: {
        image: "symphony-codex:latest",
        network: "",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: { memory: "4g", memoryReservation: "1g", memorySwap: "4g", cpus: "2.0", tmpfsSize: "512m" },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    server: { port: 4000 },
  };
}

function createAttemptRecord(overrides?: Partial<AttemptRecord>): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "Test Issue",
    workspaceKey: "MT-42",
    workspacePath: "/tmp/symphony/MT-42",
    status: "completed",
    attemptNumber: 1,
    startedAt: "2026-03-15T00:00:00Z",
    endedAt: "2026-03-15T00:01:00Z",
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: "thread-1",
    turnId: "turn-1",
    turnCount: 1,
    errorCode: null,
    errorMessage: null,
    tokenUsage: null,
    ...overrides,
  };
}

function createEvent(overrides?: Partial<RecentEvent>): RecentEvent {
  return {
    at: "2026-03-15T00:00:01Z",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    sessionId: "session-1",
    event: "worker_started",
    message: "Worker started",
    ...overrides,
  };
}

function createAttemptStore(overrides?: {
  attempts?: AttemptRecord[];
  events?: RecentEvent[];
  attemptsByIssue?: Map<string, AttemptRecord[]>;
}): SnapshotBuilderDeps["attemptStore"] {
  const attempts = overrides?.attempts ?? [];
  const events = overrides?.events ?? [];
  const attemptsByIssue = overrides?.attemptsByIssue ?? new Map();

  return {
    getAttempt: (attemptId: string) => attempts.find((a) => a.attemptId === attemptId) ?? null,
    getAllAttempts: () => attempts,
    getEvents: (attemptId: string) =>
      events.filter((e) => {
        const attemptIdFromEvent = (e as { attemptId?: string }).attemptId;
        return attemptIdFromEvent ? attemptIdFromEvent === attemptId : true;
      }),
    getAttemptsForIssue: (issueIdentifier: string) =>
      attemptsByIssue.get(issueIdentifier) ?? attempts.filter((a) => a.issueIdentifier === issueIdentifier),
  };
}

function createCallbacks(overrides?: Partial<SnapshotBuilderCallbacks>): SnapshotBuilderCallbacks {
  const runningEntries = new Map<string, RunningEntry>();
  const retryEntries = new Map<string, RetryRuntimeEntry>();
  const detailViews = new Map<string, RuntimeIssueView>();
  const completedViews = new Map<string, RuntimeIssueView>();
  const queuedViews: RuntimeIssueView[] = [];
  const recentEvents: RecentEvent[] = [];

  return {
    getConfig: () => createConfig(),
    resolveModelSelection: () => createModelSelection(),
    getDetailViews: () => detailViews,
    getCompletedViews: () => completedViews,
    getRunningEntries: () => runningEntries,
    getRetryEntries: () => retryEntries,
    getQueuedViews: () => queuedViews,
    getRecentEvents: () => recentEvents,
    getRateLimits: () => null,
    getCodexTotals: () => ({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      secondsRunning: 60,
    }),
    ...overrides,
  };
}

describe("snapshot-builder", () => {
  describe("buildSnapshot", () => {
    it("builds an empty snapshot when no state is present", () => {
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks();

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.counts).toEqual({ running: 0, retrying: 0 });
      expect(snapshot.running).toEqual([]);
      expect(snapshot.retrying).toEqual([]);
      expect(snapshot.queued).toEqual([]);
      expect(snapshot.completed).toEqual([]);
      expect(snapshot.workflowColumns).toBeDefined();
      expect(snapshot.codexTotals.secondsRunning).toBe(0);
    });

    it("includes running entries in the snapshot", () => {
      const runningEntry = createRunningEntry();
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["MT-42", runningEntry]]),
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.counts.running).toBe(1);
      expect(snapshot.running).toHaveLength(1);
      expect(snapshot.running[0]).toMatchObject({
        identifier: "MT-42",
        status: "running",
        attempt: 1,
        workspaceKey: "MT-42",
      });
    });

    it("includes retrying entries in the snapshot", () => {
      const retryEntry = createRetryEntry();
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getRetryEntries: () => new Map([["MT-43", retryEntry]]),
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.counts.retrying).toBe(1);
      expect(snapshot.retrying).toHaveLength(1);
      expect(snapshot.retrying[0]).toMatchObject({
        identifier: "MT-43",
        status: "retrying",
        attempt: 2,
        error: "turn_failed",
      });
    });

    it("includes queued and completed views", () => {
      const queuedView: RuntimeIssueView = {
        issueId: "issue-3",
        identifier: "MT-44",
        title: "Queued Issue",
        state: "Todo",
        workspaceKey: null,
        message: null,
        status: "queued",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: null,
        error: null,
      };
      const completedView: RuntimeIssueView = {
        issueId: "issue-4",
        identifier: "MT-45",
        title: "Completed Issue",
        state: "Done",
        workspaceKey: "MT-45",
        message: "Completed successfully",
        status: "completed",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: 1,
        error: null,
      };
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getQueuedViews: () => [queuedView],
        getCompletedViews: () => new Map([["MT-45", completedView]]),
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.queued).toEqual([expect.objectContaining({ identifier: "MT-44", status: "queued" })]);
      expect(snapshot.completed).toEqual([expect.objectContaining({ identifier: "MT-45", status: "completed" })]);
    });

    it("computes seconds running from archived attempts and live entries", () => {
      const archivedAttempt = createAttemptRecord({
        startedAt: "2026-03-15T00:00:00Z",
        endedAt: "2026-03-15T00:02:00Z",
      });
      const runningEntry = createRunningEntry({ startedAtMs: Date.now() - 30000 });

      const deps = {
        attemptStore: createAttemptStore({ attempts: [archivedAttempt] }),
      };
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["MT-42", runningEntry]]),
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.codexTotals.secondsRunning).toBeGreaterThanOrEqual(120);
      expect(snapshot.codexTotals.secondsRunning).toBeLessThan(160);
    });

    it("includes recent events and rate limits", () => {
      const event = createEvent();
      const rateLimits = { requestsRemaining: 100, resetAt: "2026-03-16T01:00:00Z" };
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getRecentEvents: () => [event],
        getRateLimits: () => rateLimits,
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.recentEvents).toEqual([event]);
      expect(snapshot.rateLimits).toBe(rateLimits);
    });

    it("builds workflow columns from state", () => {
      const runningEntry = createRunningEntry();
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["MT-42", runningEntry]]),
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.workflowColumns).toBeDefined();
      expect(snapshot.workflowColumns.length).toBeGreaterThan(0);
      expect(snapshot.workflowColumns[0]).toMatchObject({
        key: expect.any(String),
        label: expect.any(String),
        kind: expect.any(String),
      });
    });
  });

  describe("buildIssueDetail", () => {
    it("returns null when issue is not found", () => {
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks();

      const detail = buildIssueDetail("MT-99", deps, callbacks);

      expect(detail).toBeNull();
    });

    it("builds detail for a running issue", () => {
      const runningEntry = createRunningEntry();
      const event = createEvent();
      const attempt = createAttemptRecord();

      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attempt],
          events: [event],
          attemptsByIssue: new Map([["MT-42", [attempt]]]),
        }),
      };
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["MT-42", runningEntry]]),
        getRecentEvents: () => [event],
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      expect(detail).toMatchObject({
        identifier: "MT-42",
        status: "running",
        currentAttemptId: "run-1",
        recentEvents: [event],
        attempts: [expect.objectContaining({ attemptId: "attempt-1" })],
      });
    });

    it("builds detail for a retrying issue", () => {
      const retryEntry = createRetryEntry();
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getRetryEntries: () => new Map([["MT-43", retryEntry]]),
        getRecentEvents: () => [createEvent({ issueIdentifier: "MT-43" })],
      });

      const detail = buildIssueDetail("MT-43", deps, callbacks);

      expect(detail).toMatchObject({
        identifier: "MT-43",
        status: "retrying",
        attempt: 2,
        error: "turn_failed",
        recentEvents: [expect.objectContaining({ issueIdentifier: "MT-43" })],
      });
    });

    it("builds detail for a completed issue", () => {
      const completedView: RuntimeIssueView = {
        issueId: "issue-1",
        identifier: "MT-42",
        title: "Completed Issue",
        state: "Done",
        workspaceKey: "MT-42",
        message: "Completed",
        status: "completed",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: 1,
        error: null,
      };
      const archivedAttempt = createAttemptRecord();
      const archivedEvent = createEvent({ attemptId: "attempt-1" } as Partial<RecentEvent> as RecentEvent);
      const deps = {
        attemptStore: createAttemptStore({
          attempts: [archivedAttempt],
          events: [archivedEvent],
          attemptsByIssue: new Map([["MT-42", [archivedAttempt]]]),
        }),
      };
      const callbacks = createCallbacks({
        getCompletedViews: () => new Map([["MT-42", completedView]]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      expect(detail).toMatchObject({
        identifier: "MT-42",
        status: "completed",
        recentEvents: [archivedEvent],
      });
    });

    it("prioritizes running over retrying over completed over detail views", () => {
      const runningEntry = createRunningEntry();
      const retryEntry = createRetryEntry({ identifier: "MT-42", issue: createIssue({ identifier: "MT-42" }) });
      const completedView: RuntimeIssueView = {
        issueId: "issue-1",
        identifier: "MT-42",
        title: "Completed Issue",
        state: "Done",
        workspaceKey: "MT-42",
        message: "Completed",
        status: "completed",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: 1,
        error: null,
      };
      const detailView: RuntimeIssueView = {
        issueId: "issue-1",
        identifier: "MT-42",
        title: "Detail View",
        state: "Todo",
        workspaceKey: null,
        message: null,
        status: "queued",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: null,
        error: null,
      };

      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["MT-42", runningEntry]]),
        getRetryEntries: () => new Map([["MT-42", retryEntry]]),
        getCompletedViews: () => new Map([["MT-42", completedView]]),
        getDetailViews: () => new Map([["MT-42", detailView]]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      expect(detail).toMatchObject({ status: "running" });
    });
  });

  describe("buildAttemptDetail", () => {
    it("returns null when attempt is not found", () => {
      const deps = { attemptStore: createAttemptStore() };

      const detail = buildAttemptDetail("nonexistent", deps);

      expect(detail).toBeNull();
    });

    it("builds attempt detail with events", () => {
      const attempt = createAttemptRecord();
      const event = createEvent({ attemptId: "attempt-1" } as Partial<RecentEvent> as RecentEvent);

      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attempt],
          events: [event],
        }),
      };

      const detail = buildAttemptDetail("attempt-1", deps);

      expect(detail).toMatchObject({
        attemptId: "attempt-1",
        events: [event],
      });
    });
  });

  describe("buildRunningIssueView", () => {
    it("converts a running entry to a runtime issue view", () => {
      const entry = createRunningEntry();
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view).toMatchObject({
        identifier: "MT-42",
        status: "running",
        attempt: 1,
        workspaceKey: "MT-42",
        workspacePath: "/tmp/symphony/MT-42",
        model: "gpt-5.4",
        reasoningEffort: "high",
      });
      expect(view.modelChangePending).toBe(false);
    });

    it("marks model change as pending when configured differs from active", () => {
      const entry = createRunningEntry();
      const resolveModelSelection = vi.fn().mockReturnValue({
        model: "gpt-5",
        reasoningEffort: "medium",
        source: "override" as const,
      });

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.modelChangePending).toBe(true);
      expect(view.configuredModel).toBe("gpt-5");
      expect(view.configuredReasoningEffort).toBe("medium");
      expect(view.configuredModelSource).toBe("override");
    });
  });

  describe("buildRetryIssueView", () => {
    it("converts a retry entry to a runtime issue view", () => {
      const entry = createRetryEntry();
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRetryIssueView(entry, resolveModelSelection);

      expect(view).toMatchObject({
        identifier: "MT-43",
        status: "retrying",
        attempt: 2,
        error: "turn_failed",
        workspaceKey: "MT-43",
        model: "gpt-5.4",
        reasoningEffort: "high",
      });
      expect(view.modelChangePending).toBe(false);
      expect(view.message).toMatch(/retry due at/);
    });
  });

  describe("computeSecondsRunning", () => {
    it("computes seconds from archived attempts", () => {
      const archivedAttempt = createAttemptRecord({
        startedAt: "2026-03-15T00:00:00Z",
        endedAt: "2026-03-15T00:02:00Z",
      });
      const attemptStore = createAttemptStore({ attempts: [archivedAttempt] });
      const getRunningEntries = () => new Map<string, RunningEntry>();

      const seconds = computeSecondsRunning(attemptStore, getRunningEntries);

      expect(seconds).toBe(120);
    });

    it("computes seconds from live running entries", () => {
      const attemptStore = createAttemptStore({ attempts: [] });
      const runningEntry = createRunningEntry({ startedAtMs: Date.now() - 30000 });
      const getRunningEntries = () => new Map([["MT-42", runningEntry]]);

      const seconds = computeSecondsRunning(attemptStore, getRunningEntries);

      expect(seconds).toBeGreaterThanOrEqual(30);
      expect(seconds).toBeLessThan(35);
    });

    it("combines archived and live seconds", () => {
      const archivedAttempt = createAttemptRecord({
        startedAt: "2026-03-15T00:00:00Z",
        endedAt: "2026-03-15T00:01:00Z",
      });
      const runningEntry = createRunningEntry({ startedAtMs: Date.now() - 30000 });
      const attemptStore = createAttemptStore({ attempts: [archivedAttempt] });
      const getRunningEntries = () => new Map([["MT-42", runningEntry]]);

      const seconds = computeSecondsRunning(attemptStore, getRunningEntries);

      expect(seconds).toBeGreaterThanOrEqual(90);
      expect(seconds).toBeLessThan(95);
    });

    it("ignores attempts without endedAt", () => {
      const runningAttempt = createAttemptRecord({
        startedAt: "2026-03-15T00:00:00Z",
        endedAt: null,
        status: "running",
      });
      const attemptStore = createAttemptStore({ attempts: [runningAttempt] });
      const getRunningEntries = () => new Map<string, RunningEntry>();

      const seconds = computeSecondsRunning(attemptStore, getRunningEntries);

      expect(seconds).toBe(0);
    });

    it("handles invalid date ranges gracefully", () => {
      const invalidAttempt = createAttemptRecord({
        startedAt: "2026-03-15T00:02:00Z",
        endedAt: "2026-03-15T00:01:00Z",
      });
      const attemptStore = createAttemptStore({ attempts: [invalidAttempt] });
      const getRunningEntries = () => new Map<string, RunningEntry>();

      const seconds = computeSecondsRunning(attemptStore, getRunningEntries);

      expect(seconds).toBe(0);
    });
  });
});
