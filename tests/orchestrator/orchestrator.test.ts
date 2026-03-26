import { describe, expect, it, vi, afterEach } from "vitest";

import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import type { Issue, RunOutcome, AgentRunner, TrackerPort, WorkspaceManager } from "./orchestrator-fixtures.js";
import {
  createIssue,
  createConfig,
  createConfigStore,
  createAttemptStore,
  createLogger,
} from "./orchestrator-fixtures.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Orchestrator", () => {
  it("sorts dispatch by priority, then oldest createdAt, and skips blocked todo issues", async () => {
    vi.useFakeTimers();
    const blockedTodo = {
      ...createIssue("Todo"),
      id: "issue-0",
      identifier: "MT-10",
      blockedBy: [{ id: "blk-1", identifier: "MT-09", state: "In Progress" }],
    };
    const highPriority = { ...createIssue(), id: "issue-2", identifier: "MT-02", priority: 1 };
    const oldestPriorityPeer = {
      ...createIssue(),
      id: "issue-1",
      identifier: "MT-01",
      priority: 1,
      createdAt: "2026-03-14T00:00:00Z",
    };
    const launched: string[] = [];
    const agentRunner = {
      runAttempt: vi.fn(async ({ issue, signal }: { issue: Issue; signal: AbortSignal }): Promise<RunOutcome> => {
        launched.push(issue.identifier);
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        return {
          kind: "cancelled",
          errorCode: "shutdown",
          errorMessage: "shutdown",
          threadId: null,
          turnId: null,
          turnCount: 0,
        };
      }),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [blockedTodo, highPriority, oldestPriorityPeer]),
      fetchIssueStatesByIds: vi.fn(async (ids: string[]) =>
        [blockedTodo, highPriority, oldestPriorityPeer].filter((issue) => ids.includes(issue.id)),
      ),
      fetchIssuesByStates: vi.fn(async () => []),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async (identifier: string) => ({
        path: `/tmp/symphony/${identifier}`,
        workspaceKey: identifier,
        createdNow: true,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(launched).toEqual(["MT-01"]);
    expect(orchestrator.getSnapshot().queued).toEqual([expect.objectContaining({ identifier: "MT-02" })]);

    await orchestrator.stop();
  });

  it("queues exponential retry after abnormal exits", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    const agentRunner = {
      runAttempt: vi.fn(
        async (): Promise<RunOutcome> => ({
          kind: "failed",
          errorCode: "turn_failed",
          errorMessage: "boom",
          threadId: null,
          turnId: null,
          turnCount: 1,
        }),
      ),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async () => ({
        path: "/tmp/symphony/MT-42",
        workspaceKey: "MT-42",
        createdNow: true,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(agentRunner.runAttempt).toHaveBeenCalledTimes(1);
    expect(orchestrator.getSnapshot().retrying).toEqual([
      expect.objectContaining({
        identifier: "MT-42",
        attempt: 1,
        status: "retrying",
      }),
    ]);

    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.resolve();
    expect(agentRunner.runAttempt).toHaveBeenCalledTimes(2);

    await orchestrator.stop();
  });

  it("respects per-state concurrency limits when launching workers", async () => {
    vi.useFakeTimers();
    const inProgressA = { ...createIssue(), id: "issue-1", identifier: "MT-41" };
    const inProgressB = { ...createIssue(), id: "issue-2", identifier: "MT-42" };
    const reviewIssue = { ...createIssue("Review"), id: "issue-3", identifier: "MT-43" };
    const launched: string[] = [];
    const agentRunner = {
      runAttempt: vi.fn(async ({ issue, signal }: { issue: Issue; signal: AbortSignal }): Promise<RunOutcome> => {
        launched.push(issue.identifier);
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        return {
          kind: "cancelled",
          errorCode: "shutdown",
          errorMessage: "shutdown",
          threadId: null,
          turnId: null,
          turnCount: 0,
        };
      }),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [inProgressA, inProgressB, reviewIssue]),
      fetchIssueStatesByIds: vi.fn(async (ids: string[]) =>
        [inProgressA, inProgressB, reviewIssue].filter((issue) => ids.includes(issue.id)),
      ),
      fetchIssuesByStates: vi.fn(async () => []),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async (identifier: string) => ({
        path: `/tmp/symphony/${identifier}`,
        workspaceKey: identifier,
        createdNow: true,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const config = createConfig();
    config.agent.maxConcurrentAgents = 2;
    config.agent.maxConcurrentAgentsByState = { "in progress": 1 };
    config.tracker.activeStates = ["In Progress", "Review"];
    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(config),
      tracker,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(launched).toEqual(["MT-41", "MT-43"]);

    await orchestrator.stop();
  });

  it("builds workflow columns from configured state-machine stages", async () => {
    vi.useFakeTimers();
    const queuedIssue = { ...createIssue("Todo"), id: "issue-1", identifier: "MT-41", priority: 2 };
    const runningIssue = { ...createIssue("In Progress"), id: "issue-2", identifier: "MT-42", priority: 1 };
    const agentRunner = {
      runAttempt: vi.fn(async ({ signal }: { signal: AbortSignal }): Promise<RunOutcome> => {
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        return {
          kind: "cancelled",
          errorCode: "shutdown",
          errorMessage: "shutdown",
          threadId: null,
          turnId: null,
          turnCount: 0,
        };
      }),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [queuedIssue, runningIssue]),
      fetchIssueStatesByIds: vi.fn(async (ids: string[]) =>
        [queuedIssue, runningIssue].filter((issue) => ids.includes(issue.id)),
      ),
      fetchIssuesByStates: vi.fn(async () => []),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async (identifier: string) => ({
        path: `/tmp/symphony/${identifier}`,
        workspaceKey: identifier,
        createdNow: true,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const config = createConfig();
    config.tracker.activeStates = ["Todo", "In Progress"];
    config.agent.maxConcurrentAgents = 1;
    config.stateMachine = {
      stages: [
        { name: "Todo", kind: "todo" },
        { name: "In Progress", kind: "active" },
        { name: "Done", kind: "terminal" },
      ],
      transitions: {},
    };

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(config),
      tracker,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.workflowColumns).toEqual([
      expect.objectContaining({
        key: "todo",
        label: "Todo",
        kind: "todo",
        terminal: false,
        count: 1,
        issues: [expect.objectContaining({ identifier: "MT-41", status: "queued", state: "Todo" })],
      }),
      expect.objectContaining({
        key: "in progress",
        label: "In Progress",
        kind: "active",
        terminal: false,
        count: 1,
        issues: [expect.objectContaining({ identifier: "MT-42", status: "running" })],
      }),
      expect.objectContaining({
        key: "done",
        label: "Done",
        kind: "terminal",
        terminal: true,
        count: 0,
        issues: [],
      }),
    ]);

    await orchestrator.stop();
  });

  it("continues after a normal completion when no stop signal is present", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    const agentRunner = {
      runAttempt: vi.fn(
        async (): Promise<RunOutcome> => ({
          kind: "normal",
          errorCode: null,
          errorMessage: null,
          threadId: null,
          turnId: null,
          turnCount: 1,
        }),
      ),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async () => ({
        path: "/tmp/symphony/MT-42",
        workspaceKey: "MT-42",
        createdNow: true,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(orchestrator.getSnapshot().retrying).toEqual([
      expect.objectContaining({
        identifier: "MT-42",
        attempt: 1,
        status: "retrying",
      }),
    ]);

    await orchestrator.stop();
  });

  it("cancels active workers during shutdown", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    let observedAbort = false;
    const agentRunner = {
      runAttempt: vi.fn(async ({ signal }: { signal: AbortSignal }): Promise<RunOutcome> => {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            observedAbort = true;
            resolve();
          });
        });
        return {
          kind: "cancelled",
          errorCode: "cancelled",
          errorMessage: "cancelled",
          threadId: null,
          turnId: null,
          turnCount: 0,
        };
      }),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async () => ({
        path: "/tmp/symphony/MT-42",
        workspaceKey: "MT-42",
        createdNow: true,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await orchestrator.stop();

    expect(observedAbort).toBe(true);
    expect(orchestrator.getSnapshot().retrying).toEqual([]);
  });

  it("aborts a running issue and keeps it from redispatching", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    const control = { resolveAbort: null as null | (() => void) };
    const agentRunner = {
      runAttempt: vi.fn(async ({ signal }: { signal: AbortSignal }): Promise<RunOutcome> => {
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              control.resolveAbort = resolve;
            },
            { once: true },
          );
        });
        return {
          kind: "cancelled",
          errorCode: String(signal.reason ?? "cancelled"),
          errorMessage: "cancelled",
          threadId: null,
          turnId: null,
          turnCount: 0,
        };
      }),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
      fetchIssuesByStates: vi.fn(async () => []),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async () => ({
        path: "/tmp/symphony/MT-42",
        workspaceKey: "MT-42",
        createdNow: true,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const abortResult = orchestrator.abortIssue(issue.identifier);
    expect(abortResult).toEqual(expect.objectContaining({ ok: true, alreadyStopping: false }));
    expect(orchestrator.getSnapshot().running).toEqual([
      expect.objectContaining({
        identifier: issue.identifier,
        status: "stopping",
        message: "stopping in /tmp/symphony/MT-42",
      }),
    ]);

    if (typeof control.resolveAbort === "function") {
      control.resolveAbort();
    }
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(agentRunner.runAttempt).toHaveBeenCalledTimes(1);
    expect(orchestrator.getSnapshot().completed).toEqual(
      expect.arrayContaining([expect.objectContaining({ identifier: issue.identifier, status: "cancelled" })]),
    );

    await orchestrator.stop();
  });

  it("does not queue retries for hard startup failures", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    const agentRunner = {
      runAttempt: vi.fn(
        async (): Promise<RunOutcome> => ({
          kind: "failed",
          errorCode: "startup_failed",
          errorMessage: "codex home is misconfigured",
          threadId: null,
          turnId: null,
          turnCount: 0,
        }),
      ),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async () => ({
        path: "/tmp/symphony/MT-42",
        workspaceKey: "MT-42",
        createdNow: true,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(agentRunner.runAttempt).toHaveBeenCalledTimes(1);
    expect(orchestrator.getSnapshot().retrying).toEqual([]);
    expect(orchestrator.getSnapshot().completed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: "MT-42",
          status: "failed",
          error: "startup_failed",
        }),
      ]),
    );

    await orchestrator.stop();
  });

  it("stores model changes for the next run without aborting the active worker", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    let observedAbort = false;
    const agentRunner = {
      runAttempt: vi.fn(async ({ signal }: { signal: AbortSignal }): Promise<RunOutcome> => {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            observedAbort = true;
            resolve();
          });
        });
        return {
          kind: "cancelled",
          errorCode: "shutdown",
          errorMessage: "shutdown",
          threadId: null,
          turnId: null,
          turnCount: 0,
        };
      }),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async () => ({
        path: "/tmp/symphony/MT-42",
        workspaceKey: "MT-42",
        createdNow: true,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const result = await orchestrator.updateIssueModelSelection({
      identifier: "MT-42",
      model: "gpt-5",
      reasoningEffort: "medium",
    });
    const detail = orchestrator.getIssueDetail("MT-42");

    expect(result).toMatchObject({
      restarted: false,
      appliesNextAttempt: true,
      selection: {
        model: "gpt-5",
        reasoningEffort: "medium",
      },
    });
    expect(observedAbort).toBe(false);
    expect(detail).toMatchObject({
      model: "gpt-5.4",
      reasoningEffort: "high",
      configuredModel: "gpt-5",
      configuredReasoningEffort: "medium",
      modelChangePending: true,
    });

    await orchestrator.stop();
  });
});
