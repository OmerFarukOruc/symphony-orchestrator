import { describe, expect, it, vi, beforeEach } from "vitest";

import { handleStopSignal } from "../../src/orchestrator/worker-outcome/stop-signal.js";
import type { UpsertPrInput } from "../../src/core/attempt-store-port.js";
import type { Issue, ModelSelection, RuntimeIssueView, ServiceConfig, Workspace } from "../../src/core/types.js";
import type { OutcomeContext } from "../../src/orchestrator/context.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";
import type { PreparedWorkerOutcome } from "../../src/orchestrator/worker-outcome/types.js";
import { createIssue, createWorkspace, createModelSelection, createRunningEntry } from "./issue-test-factories.js";

function makeConfig(overrides: Partial<ServiceConfig["agent"]> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "MT",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
    agent: {
      maxConcurrentAgents: 5,
      maxConcurrentAgentsByState: {},
      maxTurns: 10,
      maxRetryBackoffMs: 300_000,
      maxContinuationAttempts: 5,
      successState: null,
      stallTimeoutMs: 1_200_000,
      ...overrides,
    },
  } as unknown as ServiceConfig;
}

function makeOutcome() {
  return {
    kind: "normal" as const,
    errorCode: null,
    errorMessage: null,
    threadId: null,
    turnId: null,
    turnCount: 1,
  };
}

function makeCtx(
  overrides: {
    config?: ServiceConfig;
    gitManager?: OutcomeContext["deps"]["gitManager"];
    attemptStore?: OutcomeContext["deps"]["attemptStore"];
  } = {},
): OutcomeContext {
  const config = overrides.config ?? makeConfig();
  const attemptStore =
    overrides.attemptStore ??
    ({
      updateAttempt: vi.fn().mockResolvedValue(undefined),
    } satisfies OutcomeContext["deps"]["attemptStore"]);
  return {
    runningEntries: new Map<string, RunningEntry>(),
    completedViews: new Map<string, RuntimeIssueView>(),
    detailViews: new Map<string, RuntimeIssueView>(),
    deps: {
      tracker: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue([]),
        resolveStateId: vi.fn().mockResolvedValue(null),
        updateIssueState: vi.fn().mockResolvedValue(undefined),
        createComment: vi.fn().mockResolvedValue(undefined),
      },
      attemptStore,
      workspaceManager: {
        removeWorkspace: vi.fn().mockResolvedValue(undefined),
      },
      gitManager: overrides.gitManager ?? undefined,
      eventBus: { emit: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn() },
    },
    isRunning: () => true,
    getConfig: () => config,
    releaseIssueClaim: vi.fn(),
    markDirty: vi.fn(),
    resolveModelSelection: vi.fn().mockReturnValue(createModelSelection()),
    notify: vi.fn(),
    retryCoordinator: {
      dispatch: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
    },
  } as unknown as OutcomeContext;
}

function makePrepared(
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
  overrides: Partial<PreparedWorkerOutcome> = {},
): PreparedWorkerOutcome {
  return { outcome: makeOutcome(), entry, issue, latestIssue: issue, workspace, attempt, modelSelection, ...overrides };
}

const repoMatch = {
  repoUrl: "https://github.com/org/repo",
  defaultBranch: "main",
  identifierPrefix: "MT",
  githubOwner: "org",
  githubRepo: "repo",
  githubTokenEnv: "GITHUB_TOKEN",
  matchedBy: "identifier_prefix" as const,
};

const flushAsyncWork = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function createGitManagerMock(
  overrides: Partial<OutcomeContext["deps"]["gitManager"]> = {},
): NonNullable<OutcomeContext["deps"]["gitManager"]> {
  return {
    commitAndPush: vi.fn().mockResolvedValue({ pushed: true, committed: true, branchName: "mt-42" }),
    createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    forcePushIfBranchExists: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("handleStopSignal — done signal", () => {
  let ctx: OutcomeContext;
  let issue: Issue;
  let workspace: Workspace;
  let modelSelection: ModelSelection;

  beforeEach(() => {
    issue = createIssue();
    workspace = createWorkspace();
    modelSelection = createModelSelection();
  });

  it("triggers git post-run and records PR URL on success", async () => {
    const gitManager = createGitManagerMock({
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, committed: true, branchName: "mt-42" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    });
    ctx = makeCtx({ gitManager });
    const entry = createRunningEntry({ repoMatch });

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(gitManager.commitAndPush).toHaveBeenCalled();
    expect(gitManager.createPullRequest).toHaveBeenCalled();
    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenCalledWith(
      entry.runId,
      expect.objectContaining({ pullRequestUrl: "https://github.com/org/repo/pull/99", status: "completed" }),
    );
    expect(ctx.deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://github.com/org/repo/pull/99" }),
      "pull request created",
    );
  });

  it("registers PR monitoring through class-based attempt store without losing this binding", async () => {
    const gitManager = createGitManagerMock({
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, committed: true, branchName: "mt-42" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    });

    class ClassBackedAttemptStore {
      readonly updateAttempt = vi.fn().mockResolvedValue(undefined);
      readonly marker = "bound";
      lastMarker: string | null = null;
      lastPr: UpsertPrInput | null = null;

      async upsertPr(pr: UpsertPrInput): Promise<void> {
        this.lastMarker = this.marker;
        this.lastPr = pr;
      }
    }

    const attemptStore = new ClassBackedAttemptStore();
    ctx = makeCtx({ gitManager, attemptStore });
    const entry = createRunningEntry({ repoMatch });

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, workspace, modelSelection, 1));
    await flushAsyncWork();

    expect(attemptStore.lastMarker).toBe("bound");
    expect(attemptStore.lastPr).toMatchObject({
      issueId: issue.id,
      owner: "org",
      repo: "repo",
      pullNumber: 99,
      url: "https://github.com/org/repo/pull/99",
      attemptId: entry.runId,
      status: "open",
      branchName: issue.branchName ?? "",
    });
  });

  it("completes gracefully when git post-run throws", async () => {
    const gitManager = createGitManagerMock({
      commitAndPush: vi.fn().mockRejectedValue(new Error("push rejected")),
      createPullRequest: vi.fn(),
    });
    ctx = makeCtx({ gitManager });
    const entry = createRunningEntry({ repoMatch });

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(ctx.deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ issue_identifier: issue.identifier, error: "push rejected" }),
      expect.stringContaining("git post-run failed"),
    );
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
  });

  it("skips git post-run when gitManager is not available", async () => {
    ctx = makeCtx({ gitManager: undefined });
    const entry = createRunningEntry({ repoMatch });

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
  });

  it("skips git post-run when entry has no repoMatch", async () => {
    const gitManager = createGitManagerMock({
      commitAndPush: vi.fn(),
      createPullRequest: vi.fn(),
    });
    ctx = makeCtx({ gitManager });
    const entry = createRunningEntry({ repoMatch: null });

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(gitManager.commitAndPush).not.toHaveBeenCalled();
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_completed" }));
  });

  it("sets completed view with status 'completed'", async () => {
    ctx = makeCtx();
    const entry = createRunningEntry();

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, workspace, modelSelection, 2));

    const view = ctx.completedViews.get(issue.identifier);
    expect(view).toMatchObject({
      status: "completed",
      message: "worker reported issue complete",
    });
  });

  it("sends worker_completed notification with info severity", async () => {
    ctx = makeCtx();
    const entry = createRunningEntry();

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(ctx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "worker_completed",
        severity: "info",
        message: "worker reported issue complete",
        metadata: expect.objectContaining({ workspace: workspace.path }),
      }),
    );
  });

  it("emits issue.completed event with 'completed' outcome", async () => {
    ctx = makeCtx();
    const entry = createRunningEntry();

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(ctx.deps.eventBus?.emit).toHaveBeenCalledWith("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "completed",
    });
  });

  it("does NOT release claim on done (keeps sticky)", async () => {
    ctx = makeCtx();
    const entry = createRunningEntry();

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(ctx.releaseIssueClaim).not.toHaveBeenCalled();
  });
});

describe("handleStopSignal — blocked signal", () => {
  let ctx: OutcomeContext;
  let issue: Issue;
  let workspace: Workspace;
  let modelSelection: ModelSelection;

  beforeEach(() => {
    ctx = makeCtx();
    issue = createIssue();
    workspace = createWorkspace();
    modelSelection = createModelSelection();
  });

  it("sets completed view with status 'paused'", async () => {
    const entry = createRunningEntry();

    await handleStopSignal(ctx, "blocked", makePrepared(entry, issue, workspace, modelSelection, 1));

    const view = ctx.completedViews.get(issue.identifier);
    expect(view).toMatchObject({
      status: "paused",
      message: "worker reported issue blocked",
    });
  });

  it("sends worker_failed notification with critical severity", async () => {
    const entry = createRunningEntry();

    await handleStopSignal(ctx, "blocked", makePrepared(entry, issue, workspace, modelSelection, 3));

    expect(ctx.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "worker_failed",
        severity: "critical",
        message: "worker reported issue blocked",
      }),
    );
  });

  it("emits issue.completed event with 'paused' outcome", async () => {
    const entry = createRunningEntry();

    await handleStopSignal(ctx, "blocked", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(ctx.deps.eventBus?.emit).toHaveBeenCalledWith("issue.completed", {
      issueId: issue.id,
      identifier: issue.identifier,
      outcome: "paused",
    });
  });

  it("releases claim on blocked", async () => {
    const entry = createRunningEntry();

    await handleStopSignal(ctx, "blocked", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(ctx.releaseIssueClaim).toHaveBeenCalledWith(issue.id);
  });

  it("does not trigger git post-run", async () => {
    const gitManager = createGitManagerMock({
      commitAndPush: vi.fn(),
      createPullRequest: vi.fn(),
    });
    const ctxWithGit = makeCtx({ gitManager });
    const entry = createRunningEntry({ repoMatch });

    await handleStopSignal(ctxWithGit, "blocked", makePrepared(entry, issue, workspace, modelSelection, 1));

    expect(gitManager.commitAndPush).not.toHaveBeenCalled();
  });

  it("updates attempt store with paused status", async () => {
    const entry = createRunningEntry();

    await handleStopSignal(ctx, "blocked", makePrepared(entry, issue, workspace, modelSelection, 2));

    expect(ctx.deps.attemptStore.updateAttempt).toHaveBeenCalledWith(
      entry.runId,
      expect.objectContaining({ stopSignal: "blocked", status: "paused" }),
    );
  });
});

describe("handleStopSignal — attempt store error handling", () => {
  it("swallows attempt store update errors gracefully", async () => {
    const ctx = makeCtx();
    const updateAttemptMock = ctx.deps.attemptStore.updateAttempt as ReturnType<typeof vi.fn>;
    updateAttemptMock.mockRejectedValue(new Error("db write failed"));

    const entry = createRunningEntry();
    const issue = createIssue();

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, createWorkspace(), createModelSelection(), 1));

    expect(ctx.deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ attempt_id: entry.runId, error: "db write failed" }),
      expect.stringContaining("attempt update failed"),
    );
    // Still proceeds with rest of the flow
    expect(ctx.notify).toHaveBeenCalled();
  });
});

describe("handleStopSignal — pullRequestUrl logging", () => {
  it("does not log PR created when pullRequestUrl is null", async () => {
    const ctx = makeCtx();
    const entry = createRunningEntry({ repoMatch: null });
    const issue = createIssue();

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, createWorkspace(), createModelSelection(), 1));

    // Should NOT have the "pull request created" log
    const infoCalls = (ctx.deps.logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const prCreatedCall = infoCalls.find(
      (call: unknown[]) => typeof call[1] === "string" && call[1].includes("pull request created"),
    );
    expect(prCreatedCall).toBeUndefined();
  });

  it("logs PR created when pullRequestUrl is present", async () => {
    const gitManager = createGitManagerMock({
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, committed: true, branchName: "mt-42" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/1" }),
    });
    const ctx = makeCtx({ gitManager });
    const entry = createRunningEntry({ repoMatch });
    const issue = createIssue();

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, createWorkspace(), createModelSelection(), 1));

    expect(ctx.deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://github.com/org/repo/pull/1" }),
      "pull request created",
    );
  });
});

describe("handleStopSignal — writeback integration", () => {
  it("calls writeCompletionWriteback (void-dispatched) on done", async () => {
    const ctx = makeCtx();
    const entry = createRunningEntry({
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    const issue = createIssue();

    await handleStopSignal(ctx, "done", makePrepared(entry, issue, createWorkspace(), createModelSelection(), 1));
    await flushAsyncWork();

    expect(ctx.deps.tracker.createComment).toHaveBeenCalledWith(
      issue.id,
      expect.stringContaining("**Risoluto agent completed**"),
    );
  });

  it("calls writeCompletionWriteback (void-dispatched) on blocked", async () => {
    const ctx = makeCtx();
    const entry = createRunningEntry();
    const issue = createIssue();

    await handleStopSignal(ctx, "blocked", makePrepared(entry, issue, createWorkspace(), createModelSelection(), 1));
    await flushAsyncWork();

    expect(ctx.deps.tracker.createComment).toHaveBeenCalledWith(
      issue.id,
      expect.stringContaining("**Risoluto agent blocked**"),
    );
  });
});
