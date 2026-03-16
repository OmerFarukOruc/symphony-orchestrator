import { describe, expect, it, vi, afterEach } from "vitest";

import { Orchestrator } from "../src/orchestrator.js";
import { createLogger } from "../src/logger.js";
import type { Issue, RunOutcome, ServiceConfig, WorkflowDefinition } from "../src/types.js";
import { ConfigStore } from "../src/config.js";
import { LinearClient } from "../src/linear-client.js";
import { WorkspaceManager } from "../src/workspace-manager.js";
import { AgentRunner } from "../src/agent-runner.js";
import { AttemptStore } from "../src/attempt-store.js";

function createIssue(state = "In Progress"): Issue {
  return {
    id: "issue-1",
    identifier: "MT-42",
    title: "Retry me",
    description: null,
    priority: 1,
    state,
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-16T00:00:00Z",
  };
}

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      projectSlug: "EXAMPLE",
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
      maxTurns: 1,
      maxRetryBackoffMs: 120000,
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
      stallTimeoutMs: 10000,
    },
    server: { port: 4000 },
  };
}

function createConfigStore(config: ServiceConfig): ConfigStore {
  const workflow: WorkflowDefinition = { config: {}, promptTemplate: "Prompt" };
  return {
    getConfig: () => config,
    getWorkflow: () => workflow,
    subscribe: () => () => undefined,
  } as unknown as ConfigStore;
}

function createAttemptStore(): AttemptStore {
  return {
    createAttempt: vi.fn(async () => undefined),
    updateAttempt: vi.fn(async () => undefined),
    appendEvent: vi.fn(async () => undefined),
    getAttemptsForIssue: vi.fn(() => []),
    getAttempt: vi.fn(() => null),
    getEvents: vi.fn(() => []),
  } as unknown as AttemptStore;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Orchestrator", () => {
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
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as LinearClient;
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
      linearClient,
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
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as LinearClient;
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
      linearClient,
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
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as LinearClient;
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
      linearClient,
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
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as LinearClient;
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
      linearClient,
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
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as LinearClient;
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
      linearClient,
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

  it("stops after a normal completion when the agent reports the issue is complete", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    const agentRunner = {
      runAttempt: vi.fn(
        async ({
          issue: currentIssue,
          onEvent,
        }: {
          issue: Issue;
          onEvent: (event: {
            at: string;
            issueId: string;
            issueIdentifier: string;
            sessionId: string | null;
            event: string;
            message: string;
            content?: string | null;
          }) => void;
        }): Promise<RunOutcome> => {
          onEvent({
            at: "2026-03-16T00:00:01Z",
            issueId: currentIssue.id,
            issueIdentifier: currentIssue.identifier,
            sessionId: "session-1",
            event: "item_completed",
            message: "agentMessage msg-1 completed",
            content: "The issue is already complete. No further in-scope work is needed.\nSYMPHONY_STATUS: DONE",
          });
          return {
            kind: "normal",
            errorCode: null,
            errorMessage: null,
            threadId: "thread-1",
            turnId: "turn-1",
            turnCount: 1,
          };
        },
      ),
    } as unknown as AgentRunner;
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as LinearClient;
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
      linearClient,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(orchestrator.getSnapshot().retrying).toEqual([]);
    expect(orchestrator.getSnapshot().completed).toEqual([
      expect.objectContaining({
        identifier: "MT-42",
        status: "completed",
        message: "worker reported issue complete",
      }),
    ]);

    await orchestrator.stop();
  });

  it("does not queue or launch inactive issues", async () => {
    vi.useFakeTimers();
    const inactiveIssue = createIssue("Todo");
    const agentRunner = {
      runAttempt: vi.fn(),
    } as unknown as AgentRunner;
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [inactiveIssue]),
      fetchIssueStatesByIds: vi.fn(async () => [inactiveIssue]),
    } as unknown as LinearClient;
    const workspaceManager = {
      ensureWorkspace: vi.fn(),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      linearClient,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const snapshot = orchestrator.getSnapshot();
    expect(agentRunner.runAttempt).not.toHaveBeenCalled();
    expect(workspaceManager.ensureWorkspace).not.toHaveBeenCalled();
    expect(snapshot.running).toEqual([]);
    expect(snapshot.queued).toEqual([]);

    await orchestrator.stop();
  });

  it("removes stale queued and completed entries when the issue relaunches", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    const agentRunner = {
      runAttempt: vi.fn(async ({ signal }: { signal: AbortSignal }): Promise<RunOutcome> => {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
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
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as LinearClient;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async () => ({
        path: "/tmp/symphony/MT-42",
        workspaceKey: "MT-42",
        createdNow: false,
      })),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const config = createConfig();
    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(config),
      linearClient,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    const seededView = {
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      state: issue.state,
      workspaceKey: "MT-42",
      message: "stale",
      status: "completed",
      updatedAt: issue.updatedAt ?? "2026-03-16T00:00:00Z",
      attempt: 1,
      error: null,
    };
    (orchestrator as unknown as { completedViews: Map<string, unknown> }).completedViews.set(
      issue.identifier,
      seededView,
    );
    (orchestrator as unknown as { queuedViews: Array<unknown> }).queuedViews = [seededView];

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.running).toEqual([expect.objectContaining({ identifier: "MT-42", status: "running" })]);
    expect(snapshot.queued).toEqual([]);
    expect(snapshot.completed).toEqual([]);

    await orchestrator.stop();
  });

  it("handles retry-launched worker startup failures without unhandled rejections", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    let callCount = 0;
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
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as LinearClient;
    const workspaceManager = {
      ensureWorkspace: vi.fn(async () => {
        callCount++;
        if (callCount > 1) {
          throw new Error("workspace setup exploded");
        }
        return {
          path: "/tmp/symphony/MT-42",
          workspaceKey: "MT-42",
          createdNow: true,
        };
      }),
      removeWorkspace: vi.fn(async () => undefined),
    } as unknown as WorkspaceManager;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      linearClient,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    // First tick: launch worker, it fails with turn_failed, queues retry
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(agentRunner.runAttempt).toHaveBeenCalledTimes(1);
    expect(orchestrator.getSnapshot().retrying).toHaveLength(1);

    // Advance past retry delay — ensureWorkspace will reject this time
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.resolve();
    await Promise.resolve();

    // The retry entry should be cleared and no unhandled rejection
    expect(orchestrator.getSnapshot().retrying).toEqual([]);

    await orchestrator.stop();
  });

  it("preserves failed status in completedViews after terminal issue cleanup", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    const terminalIssue = createIssue("Done");
    const agentRunner = {
      runAttempt: vi.fn(
        async (): Promise<RunOutcome> => ({
          kind: "failed",
          errorCode: "turn_failed",
          errorMessage: "agent failed",
          threadId: null,
          turnId: null,
          turnCount: 1,
        }),
      ),
    } as unknown as AgentRunner;
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [terminalIssue]),
    } as unknown as LinearClient;
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
      linearClient,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.completed).toEqual([
      expect.objectContaining({
        identifier: "MT-42",
        status: "failed",
        message: "workspace cleaned after terminal state",
      }),
    ]);

    await orchestrator.stop();
  });

  it("preserves completed status in completedViews after terminal issue cleanup for normal outcomes", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    const terminalIssue = createIssue("Done");
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
    const linearClient = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [terminalIssue]),
    } as unknown as LinearClient;
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
      linearClient,
      workspaceManager,
      agentRunner,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.completed).toEqual([
      expect.objectContaining({
        identifier: "MT-42",
        status: "completed",
        message: "workspace cleaned after terminal state",
      }),
    ]);

    await orchestrator.stop();
  });
});
