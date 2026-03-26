import { describe, expect, it, vi, afterEach } from "vitest";

import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import type { RunOutcome, AgentRunner, TrackerPort, WorkspaceManager } from "./orchestrator-fixtures.js";
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

describe("Orchestrator — advanced scenarios", () => {
  it("does not queue or launch inactive issues", async () => {
    vi.useFakeTimers();
    const inactiveIssue = createIssue("Todo");
    const agentRunner = {
      runAttempt: vi.fn(),
    } as unknown as AgentRunner;
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [inactiveIssue]),
      fetchIssueStatesByIds: vi.fn(async () => [inactiveIssue]),
    } as unknown as TrackerPort;
    const workspaceManager = {
      ensureWorkspace: vi.fn(),
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
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [issue]),
    } as unknown as TrackerPort;
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
      tracker,
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
    (orchestrator as unknown as { _state: { completedViews: Map<string, unknown> } })._state.completedViews.set(
      issue.identifier,
      seededView,
    );
    (orchestrator as unknown as { _state: { queuedViews: Array<unknown> } })._state.queuedViews = [seededView];

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
    const attemptStore = createAttemptStore();
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
      attemptStore,
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
    expect(orchestrator.getSnapshot().retrying).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(orchestrator.getSnapshot().retrying).toEqual([]);
    expect(orchestrator.getSnapshot().completed).toEqual([
      expect.objectContaining({
        identifier: "MT-42",
        status: "failed",
        attempt: 1,
        error: "Error: workspace setup exploded",
        message: "retry startup failed: Error: workspace setup exploded",
      }),
    ]);
    expect(orchestrator.getIssueDetail("MT-42")).toMatchObject({
      identifier: "MT-42",
      status: "failed",
      attempt: 1,
      error: "Error: workspace setup exploded",
      message: "retry startup failed: Error: workspace setup exploded",
    });
    expect(attemptStore.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        issueIdentifier: "MT-42",
        status: "failed",
        attemptNumber: 1,
        errorCode: "worker_failed",
        errorMessage: "Error: workspace setup exploded",
      }),
    );

    await orchestrator.stop();
  });

  it("cleans up terminal issue workspaces at startup and revalidates retries before relaunch", async () => {
    vi.useFakeTimers();
    const runningIssue = createIssue();
    const terminalIssue = createIssue("Done");
    let fetchStateCount = 0;
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
      fetchCandidateIssues: vi.fn(async () => [runningIssue]),
      fetchIssueStatesByIds: vi.fn(async () => {
        fetchStateCount += 1;
        return fetchStateCount === 1 ? [runningIssue] : [{ ...runningIssue, state: "Todo" }];
      }),
      fetchIssuesByStates: vi.fn(async () => [terminalIssue]),
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
    expect(workspaceManager.removeWorkspace).toHaveBeenCalledWith(
      "MT-42",
      expect.objectContaining({ identifier: "MT-42", state: "Done" }),
    );

    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.resolve();

    expect(agentRunner.runAttempt).toHaveBeenCalledTimes(1);
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
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [terminalIssue]),
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

    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.completed).toEqual([
      expect.objectContaining({
        identifier: "MT-42",
        status: "failed",
        attempt: null,
        error: "agent failed",
        message: "workspace cleaned after terminal state",
      }),
    ]);
    expect(orchestrator.getIssueDetail("MT-42")).toMatchObject({
      identifier: "MT-42",
      status: "failed",
      attempt: null,
      error: "agent failed",
      message: "workspace cleaned after terminal state",
    });

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
    const tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => [terminalIssue]),
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

    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.completed).toEqual([
      expect.objectContaining({
        identifier: "MT-42",
        status: "completed",
        attempt: null,
        error: null,
        message: "workspace cleaned after terminal state",
      }),
    ]);
    expect(orchestrator.getIssueDetail("MT-42")).toMatchObject({
      identifier: "MT-42",
      status: "completed",
      attempt: null,
      error: null,
      message: "workspace cleaned after terminal state",
    });

    await orchestrator.stop();
  });

  it("runs git post-processing only when the worker reports SYMPHONY_STATUS: DONE", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    const agentRunner = {
      runAttempt: vi.fn(
        async ({
          onEvent,
        }: {
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
            at: "2026-03-17T00:00:00Z",
            issueId: issue.id,
            issueIdentifier: issue.identifier,
            sessionId: "thread-1",
            event: "item_completed",
            message: "agentMessage completed",
            content: "work finished\nSYMPHONY_STATUS: DONE",
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
    const gitManager = {
      cloneInto: vi.fn(async () => ({ branchName: "symphony/mt-42" })),
      commitAndPush: vi.fn(async () => ({ committed: true, pushed: true, branchName: "symphony/mt-42" })),
      createPullRequest: vi.fn(async () => ({ html_url: "https://github.com/acme/repo/pull/1" })),
      setupWorktree: vi.fn(async () => ({ branchName: "symphony/mt-42" })),
      syncWorktree: vi.fn(async () => undefined),
      removeWorktree: vi.fn(async () => undefined),
      deriveBaseCloneDir: vi.fn((workspaceRoot: string, _repoUrl: string) => `${workspaceRoot}/.base/repo.git`),
    };
    const repoRouter = {
      matchIssue: vi.fn(() => ({
        repoUrl: "https://github.com/acme/repo.git",
        defaultBranch: "main",
        githubOwner: "acme",
        githubRepo: "repo",
        githubTokenEnv: "GITHUB_TOKEN",
        matchedBy: "identifier_prefix" as const,
      })),
    };

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker,
      workspaceManager,
      agentRunner,
      repoRouter,
      gitManager,
      logger: createLogger(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(gitManager.cloneInto).toHaveBeenCalledTimes(1);
    expect(gitManager.commitAndPush).toHaveBeenCalledTimes(1);
    expect(gitManager.createPullRequest).toHaveBeenCalledTimes(1);

    await orchestrator.stop();
  });
});
