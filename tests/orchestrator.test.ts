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
      attemptStore: {
        createAttempt: vi.fn(async () => undefined),
        updateAttempt: vi.fn(async () => undefined),
        appendEvent: vi.fn(async () => undefined),
        getAttemptsForIssue: vi.fn(() => []),
        getAttempt: vi.fn(() => null),
        getEvents: vi.fn(() => []),
      } as unknown as AttemptStore,
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
      attemptStore: {
        createAttempt: vi.fn(async () => undefined),
        updateAttempt: vi.fn(async () => undefined),
        appendEvent: vi.fn(async () => undefined),
        getAttemptsForIssue: vi.fn(() => []),
        getAttempt: vi.fn(() => null),
        getEvents: vi.fn(() => []),
      } as unknown as AttemptStore,
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
      attemptStore: {
        createAttempt: vi.fn(async () => undefined),
        updateAttempt: vi.fn(async () => undefined),
        appendEvent: vi.fn(async () => undefined),
        getAttemptsForIssue: vi.fn(() => []),
        getAttempt: vi.fn(() => null),
        getEvents: vi.fn(() => []),
      } as unknown as AttemptStore,
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
      attemptStore: {
        createAttempt: vi.fn(async () => undefined),
        updateAttempt: vi.fn(async () => undefined),
        appendEvent: vi.fn(async () => undefined),
        getAttemptsForIssue: vi.fn(() => []),
        getAttempt: vi.fn(() => null),
        getEvents: vi.fn(() => []),
      } as unknown as AttemptStore,
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
});
