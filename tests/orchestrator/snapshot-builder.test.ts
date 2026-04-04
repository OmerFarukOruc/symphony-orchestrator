import { describe, expect, it, vi } from "vitest";

import type { AttemptRecord, RecentEvent, RuntimeIssueView, ServiceConfig } from "../../src/core/types.js";
import { sumAttemptDurationSeconds } from "../../src/core/attempt-store-port.js";
import type { RunningEntry, RetryRuntimeEntry } from "../../src/orchestrator/runtime-types.js";
import {
  buildSnapshot,
  buildIssueDetail,
  buildAttemptDetail,
  buildRunningIssueView,
  buildRetryIssueView,
  computeSecondsRunning,
  computeCostUsd,
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
    path: "/tmp/risoluto/MT-42",
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
      terminalStates: ["Done", "Canceled"],
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/risoluto",
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
        image: "risoluto-codex:latest",
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
    workspacePath: "/tmp/risoluto/MT-42",
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
    sumArchivedSeconds: () => sumAttemptDurationSeconds(attempts),
    sumCostUsd: vi.fn().mockReturnValue(0),
    sumArchivedTokens: vi.fn().mockReturnValue(
      attempts.reduce(
        (acc, a) => ({
          inputTokens: acc.inputTokens + (a.tokenUsage?.inputTokens ?? 0),
          outputTokens: acc.outputTokens + (a.tokenUsage?.outputTokens ?? 0),
          totalTokens: acc.totalTokens + (a.tokenUsage?.totalTokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      ),
    ),
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
      expect(snapshot.workflowColumns).toEqual(expect.any(Array));
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

    it("includes costUsd in codexTotals", () => {
      const deps = { attemptStore: createAttemptStore() };
      (deps.attemptStore.sumCostUsd as ReturnType<typeof vi.fn>).mockReturnValue(0.042);
      const callbacks = createCallbacks();

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.codexTotals.costUsd).toBe(0.042);
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
      const event = createEvent({
        attemptId: "attempt-1",
        event: "codex_config_loaded",
        metadata: { modelProvider: "cliproxyapi" },
      } as Partial<RecentEvent> as RecentEvent);

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
        appServerBadge: { effectiveProvider: "cliproxyapi", threadStatus: null },
        appServer: {
          effectiveProvider: "cliproxyapi",
          effectiveModel: "gpt-5.4",
          reasoningEffort: "high",
        },
      });
    });

    it("adds app-server badges to archived attempts in issue detail", () => {
      const attempt = createAttemptRecord();
      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attempt],
          attemptsByIssue: new Map([["MT-42", [attempt]]]),
          events: [
            createEvent({
              attemptId: "attempt-1",
              event: "codex_config_loaded",
              metadata: { modelProvider: "cliproxyapi" },
            } as Partial<RecentEvent> as RecentEvent),
            createEvent({
              attemptId: "attempt-1",
              event: "thread_status",
              metadata: { threadStatus: { type: "active" } },
            } as Partial<RecentEvent> as RecentEvent),
          ],
        }),
      };
      const callbacks = createCallbacks({
        getCompletedViews: () =>
          new Map([
            [
              "MT-42",
              {
                issueId: "issue-1",
                identifier: "MT-42",
                title: "Test Issue",
                state: "Done",
                workspaceKey: "MT-42",
                message: null,
                status: "completed",
                updatedAt: "2026-03-15T00:01:00Z",
                attempt: 1,
                error: null,
              },
            ],
          ]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      expect(detail?.attempts[0]).toMatchObject({
        appServerBadge: { effectiveProvider: "cliproxyapi", threadStatus: "active" },
      });
    });

    it("folds app-server introspection events into a stable detail summary", () => {
      const attempt = createAttemptRecord();
      const events = [
        createEvent({
          attemptId: "attempt-1",
          event: "codex_config_loaded",
          metadata: {
            model: "gpt-5.4",
            modelProvider: "cliproxyapi",
            reasoningEffort: "high",
            approvalPolicy: "never",
          },
        } as Partial<RecentEvent> as RecentEvent),
        createEvent({
          attemptId: "attempt-1",
          event: "codex_requirements_loaded",
          metadata: {
            allowedApprovalPolicies: ["never", "onRequest"],
            allowedSandboxModes: ["workspaceWrite"],
            network: { enabled: true, allowedDomains: ["api.openai.com"] },
          },
        } as Partial<RecentEvent> as RecentEvent),
        createEvent({
          attemptId: "attempt-1",
          event: "thread_loaded",
          metadata: {
            threadId: "thread-1",
            name: "Issue thread",
            status: { type: "idle" },
            ephemeral: false,
          },
        } as Partial<RecentEvent> as RecentEvent),
        createEvent({
          attemptId: "attempt-1",
          event: "thread_status",
          metadata: {
            threadStatus: { type: "active", activeFlags: ["waitingOnApproval"] },
          },
        } as Partial<RecentEvent> as RecentEvent),
      ];

      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attempt],
          events,
        }),
      };

      const detail = buildAttemptDetail("attempt-1", deps);

      expect(detail).toMatchObject({
        attemptId: "attempt-1",
        appServer: {
          effectiveProvider: "cliproxyapi",
          effectiveModel: "gpt-5.4",
          reasoningEffort: "high",
          approvalPolicy: "never",
          threadName: "Issue thread",
          threadStatus: "active",
          allowedApprovalPolicies: ["never", "onRequest"],
          allowedSandboxModes: ["workspaceWrite"],
          networkRequirements: { enabled: true, allowedDomains: ["api.openai.com"] },
          threadStatusPayload: { type: "active", activeFlags: ["waitingOnApproval"] },
        },
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
        workspacePath: "/tmp/risoluto/MT-42",
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

  describe("computeCostUsd", () => {
    it("delegates to attemptStore.sumCostUsd()", () => {
      const attemptStore = createAttemptStore();
      (attemptStore.sumCostUsd as ReturnType<typeof vi.fn>).mockReturnValue(1.23);

      const cost = computeCostUsd(attemptStore);

      expect(cost).toBe(1.23);
    });

    it("returns 0 when store has no costed attempts", () => {
      const attemptStore = createAttemptStore();

      const cost = computeCostUsd(attemptStore);

      expect(cost).toBe(0);
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

  describe("buildSnapshot — additional coverage", () => {
    it("caps completed views at 25 entries", () => {
      const completedViews = new Map<string, RuntimeIssueView>();
      for (let i = 0; i < 30; i++) {
        completedViews.set(`MT-${i}`, {
          issueId: `issue-${i}`,
          identifier: `MT-${i}`,
          title: `Issue ${i}`,
          state: "Done",
          workspaceKey: null,
          message: null,
          status: "completed",
          updatedAt: "2026-03-16T00:00:00Z",
          attempt: 1,
          error: null,
        });
      }
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getCompletedViews: () => completedViews,
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.completed).toHaveLength(25);
    });

    it("uses Math.max for token fields (archived vs live)", () => {
      const deps = { attemptStore: createAttemptStore() };
      // Live totals are higher
      (deps.attemptStore.sumArchivedTokens as ReturnType<typeof vi.fn>).mockReturnValue({
        inputTokens: 50,
        outputTokens: 25,
        totalTokens: 75,
      });
      const callbacks = createCallbacks({
        getCodexTotals: () => ({
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          secondsRunning: 60,
        }),
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.codexTotals.inputTokens).toBe(200);
      expect(snapshot.codexTotals.outputTokens).toBe(100);
      expect(snapshot.codexTotals.totalTokens).toBe(300);
    });

    it("uses archived token counts when they exceed live totals", () => {
      const deps = { attemptStore: createAttemptStore() };
      // Archived is higher (e.g., after restart)
      (deps.attemptStore.sumArchivedTokens as ReturnType<typeof vi.fn>).mockReturnValue({
        inputTokens: 500,
        outputTokens: 250,
        totalTokens: 750,
      });
      const callbacks = createCallbacks({
        getCodexTotals: () => ({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          secondsRunning: 10,
        }),
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.codexTotals.inputTokens).toBe(500);
      expect(snapshot.codexTotals.outputTokens).toBe(250);
      expect(snapshot.codexTotals.totalTokens).toBe(750);
    });

    it("includes stall events when getStallEvents callback is provided", () => {
      const stallEvents = [
        { at: "2026-03-16T00:00:00Z", issueId: "i1", issueIdentifier: "MT-1", silentMs: 120000, timeoutMs: 60000 },
      ];
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getStallEvents: () => stallEvents,
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.stallEvents).toHaveLength(1);
      expect(snapshot.stallEvents![0]).toMatchObject({ issueId: "i1" });
    });

    it("excludes stall events when getStallEvents callback is absent", () => {
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks();
      // Make sure getStallEvents is undefined
      delete (callbacks as Partial<SnapshotBuilderCallbacks>).getStallEvents;

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.stallEvents).toBeUndefined();
    });

    it("includes systemHealth when getSystemHealth callback is provided", () => {
      const health = { status: "healthy", lastCheck: "2026-03-16T00:00:00Z" };
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getSystemHealth: () =>
          health as unknown as ReturnType<NonNullable<SnapshotBuilderCallbacks["getSystemHealth"]>>,
      });

      const snapshot = buildSnapshot(deps, callbacks);

      expect(snapshot.systemHealth).toBeDefined();
    });

    it("merges detailViews into workflowColumns completed list", () => {
      const detailView: RuntimeIssueView = {
        issueId: "issue-detail",
        identifier: "MT-99",
        title: "Detail Issue",
        state: "Done",
        workspaceKey: null,
        message: null,
        status: "completed",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: null,
        error: null,
      };
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getDetailViews: () => new Map([["MT-99", detailView]]),
      });

      const snapshot = buildSnapshot(deps, callbacks);

      // Just verify it doesn't crash and includes the detail view data
      expect(snapshot.workflowColumns).toBeDefined();
    });
  });

  describe("buildIssueDetail — additional coverage", () => {
    it("filters retry entry events by issueIdentifier", () => {
      const retryEntry = createRetryEntry();
      const matchingEvent = createEvent({ issueIdentifier: "MT-43" });
      const nonMatchingEvent = createEvent({ issueIdentifier: "MT-99" });
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getRetryEntries: () => new Map([["MT-43", retryEntry]]),
        getRecentEvents: () => [matchingEvent, nonMatchingEvent],
      });

      const detail = buildIssueDetail("MT-43", deps, callbacks);

      expect(detail).not.toBeNull();
      expect(detail!.recentEvents).toEqual([matchingEvent]);
    });

    it("loads events from archived attempts when issue is completed", () => {
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
      const archivedAttempt = createAttemptRecord({ attemptId: "a1" });
      const archivedEvent = createEvent({ attemptId: "a1" } as Partial<RecentEvent> as RecentEvent);
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

      expect(detail).not.toBeNull();
      expect(detail!.recentEvents).toEqual([archivedEvent]);
    });

    it("falls back to filtered recent events when no archived attempts", () => {
      const detailView: RuntimeIssueView = {
        issueId: "issue-1",
        identifier: "MT-50",
        title: "Queued Issue",
        state: "In Progress",
        workspaceKey: null,
        message: null,
        status: "queued",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: null,
        error: null,
      };
      const matchingEvent = createEvent({ issueIdentifier: "MT-50" });
      const otherEvent = createEvent({ issueIdentifier: "MT-99" });
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getDetailViews: () => new Map([["MT-50", detailView]]),
        getRecentEvents: () => [matchingEvent, otherEvent],
      });

      const detail = buildIssueDetail("MT-50", deps, callbacks);

      expect(detail).not.toBeNull();
      expect(detail!.recentEvents).toEqual([matchingEvent]);
    });

    it("enriches tokenUsage from archived attempts when missing on view", () => {
      const completedView: RuntimeIssueView = {
        issueId: "issue-1",
        identifier: "MT-42",
        title: "Issue",
        state: "Done",
        workspaceKey: "MT-42",
        message: null,
        status: "completed",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: 1,
        error: null,
        // tokenUsage is undefined/null
      };
      const attempt1 = createAttemptRecord({
        attemptId: "a1",
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });
      const attempt2 = createAttemptRecord({
        attemptId: "a2",
        tokenUsage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
      });
      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attempt1, attempt2],
          attemptsByIssue: new Map([["MT-42", [attempt1, attempt2]]]),
        }),
      };
      const callbacks = createCallbacks({
        getCompletedViews: () => new Map([["MT-42", completedView]]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      expect(detail!.tokenUsage).toEqual({
        inputTokens: 300,
        outputTokens: 130,
        totalTokens: 430,
      });
    });

    it("does not override existing tokenUsage with archived data", () => {
      const runningEntry = createRunningEntry({
        tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
      });
      const attempt = createAttemptRecord({
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });
      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attempt],
          attemptsByIssue: new Map([["MT-42", [attempt]]]),
        }),
      };
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["MT-42", runningEntry]]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      expect(detail!.tokenUsage).toEqual({ inputTokens: 500, outputTokens: 200, totalTokens: 700 });
    });

    it("enriches startedAt from archived attempts when missing", () => {
      const completedView: RuntimeIssueView = {
        issueId: "issue-1",
        identifier: "MT-42",
        title: "Issue",
        state: "Done",
        workspaceKey: "MT-42",
        message: null,
        status: "completed",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: 1,
        error: null,
        // startedAt is undefined
      };
      const attempt = createAttemptRecord({ startedAt: "2026-01-05T00:00:00Z" });
      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attempt],
          attemptsByIssue: new Map([["MT-42", [attempt]]]),
        }),
      };
      const callbacks = createCallbacks({
        getCompletedViews: () => new Map([["MT-42", completedView]]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      expect(detail!.startedAt).toBe("2026-01-05T00:00:00Z");
    });

    it("does not override existing startedAt from archived data", () => {
      const runningEntry = createRunningEntry({ startedAtMs: Date.now() - 10000 });
      const attempt = createAttemptRecord({ startedAt: "2025-01-01T00:00:00Z" });
      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attempt],
          attemptsByIssue: new Map([["MT-42", [attempt]]]),
        }),
      };
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["MT-42", runningEntry]]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      // startedAt should come from the running entry, not the archive
      expect(detail!.startedAt).not.toBe("2025-01-01T00:00:00Z");
    });

    it("skips token usage enrichment for attempts with null tokenUsage", () => {
      const completedView: RuntimeIssueView = {
        issueId: "issue-1",
        identifier: "MT-42",
        title: "Issue",
        state: "Done",
        workspaceKey: null,
        message: null,
        status: "completed",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: 1,
        error: null,
      };
      const attemptWithTokens = createAttemptRecord({
        attemptId: "a1",
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });
      const attemptWithout = createAttemptRecord({
        attemptId: "a2",
        tokenUsage: null,
      });
      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attemptWithTokens, attemptWithout],
          attemptsByIssue: new Map([["MT-42", [attemptWithTokens, attemptWithout]]]),
        }),
      };
      const callbacks = createCallbacks({
        getCompletedViews: () => new Map([["MT-42", completedView]]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      expect(detail!.tokenUsage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
    });

    it("returns currentAttemptId as null for non-running entries", () => {
      const completedView: RuntimeIssueView = {
        issueId: "issue-1",
        identifier: "MT-42",
        title: "Issue",
        state: "Done",
        workspaceKey: null,
        message: null,
        status: "completed",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: 1,
        error: null,
      };
      const deps = { attemptStore: createAttemptStore() };
      const callbacks = createCallbacks({
        getCompletedViews: () => new Map([["MT-42", completedView]]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);

      expect(detail!.currentAttemptId).toBeNull();
    });

    it("includes attempt summaries with all fields", () => {
      const attempt = createAttemptRecord({
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        turnCount: 3,
        threadId: "t1",
        turnId: "turn-1",
        errorCode: "worker_failed",
        errorMessage: "something broke",
      });
      const completedView: RuntimeIssueView = {
        issueId: "issue-1",
        identifier: "MT-42",
        title: "Issue",
        state: "Done",
        workspaceKey: null,
        message: null,
        status: "completed",
        updatedAt: "2026-03-16T00:00:00Z",
        attempt: 1,
        error: null,
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      };
      const deps = {
        attemptStore: createAttemptStore({
          attempts: [attempt],
          attemptsByIssue: new Map([["MT-42", [attempt]]]),
        }),
      };
      const callbacks = createCallbacks({
        getCompletedViews: () => new Map([["MT-42", completedView]]),
      });

      const detail = buildIssueDetail("MT-42", deps, callbacks);
      const summary = detail!.attempts[0];

      expect(summary.attemptId).toBe("attempt-1");
      expect(summary.attemptNumber).toBe(1);
      expect(summary.model).toBe("gpt-5.4");
      expect(summary.reasoningEffort).toBe("high");
      expect(summary.turnCount).toBe(3);
      expect(summary.threadId).toBe("t1");
      expect(summary.turnId).toBe("turn-1");
      expect(summary.errorCode).toBe("worker_failed");
      expect(summary.errorMessage).toBe("something broke");
      expect(summary.issueIdentifier).toBe("MT-42");
      expect(summary.title).toBe("Test Issue");
      expect(summary.workspacePath).toBe("/tmp/risoluto/MT-42");
      expect(summary.workspaceKey).toBe("MT-42");
      expect(summary.modelSource).toBe("default");
    });
  });
});
