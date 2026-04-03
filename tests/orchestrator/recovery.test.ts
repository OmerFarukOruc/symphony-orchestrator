import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runStartupRecovery } from "../../src/orchestrator/recovery.js";
import type {
  AttemptCheckpointRecord,
  AttemptEvent,
  AttemptRecord,
  Issue,
  ServiceConfig,
} from "../../src/core/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-recovery-test-"));
  tempDirs.push(dir);
  return dir;
}

function createAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "NIN-42",
    title: "Recover me",
    workspaceKey: "NIN-42",
    workspacePath: "/tmp/missing",
    status: "running",
    attemptNumber: 2,
    startedAt: "2026-04-03T10:00:00.000Z",
    endedAt: null,
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: "thread-123",
    turnId: "turn-9",
    turnCount: 4,
    errorCode: null,
    errorMessage: null,
    tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    pullRequestUrl: null,
    stopSignal: null,
    summary: null,
    ...overrides,
  };
}

function createIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "NIN-42",
    title: "Recover me",
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "NIN",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
  } as unknown as ServiceConfig;
}

function createAttemptStore(attempts: AttemptRecord[]) {
  return {
    getAllAttempts: vi.fn(() => attempts),
    updateAttempt: vi.fn<(_: string, __: Partial<AttemptRecord>) => Promise<void>>().mockResolvedValue(undefined),
    appendEvent: vi.fn<(_: AttemptEvent) => Promise<void>>().mockResolvedValue(undefined),
    appendCheckpoint: vi
      .fn<(_: Omit<AttemptCheckpointRecord, "checkpointId" | "ordinal">) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runStartupRecovery", () => {
  it("resumes viable running attempts on the same attempt record", async () => {
    const workspace = await createTempDir();
    await mkdir(workspace, { recursive: true });
    const attempt = createAttempt({ workspacePath: workspace });
    const attemptStore = createAttemptStore([attempt]);
    const launchWorker = vi.fn().mockResolvedValue(undefined);

    const report = await runStartupRecovery({
      attemptStore,
      tracker: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue([createIssue()]),
      },
      workspaceManager: {
        removeWorkspace: vi.fn().mockResolvedValue(undefined),
      },
      getConfig: createConfig,
      launchWorker,
      logger: { info: vi.fn(), warn: vi.fn() },
      inspectWorkspaceContainers: vi.fn().mockResolvedValue([]),
    });

    expect(report.resumed).toEqual([attempt.attemptId]);
    expect(launchWorker).toHaveBeenCalledWith(
      expect.objectContaining({ id: attempt.issueId, identifier: attempt.issueIdentifier }),
      attempt.attemptNumber,
      expect.objectContaining({
        recoveredAttempt: attempt,
        previousThreadId: attempt.threadId,
        modelSelectionOverride: {
          model: attempt.model,
          reasoningEffort: attempt.reasoningEffort,
          source: attempt.modelSource,
        },
      }),
    );
    expect(attemptStore.updateAttempt).not.toHaveBeenCalled();
    expect(attemptStore.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: attempt.attemptId,
        event: "attempt_recovery_resumed",
      }),
    );
  });

  it("cleans up unrecoverable attempts and marks them failed", async () => {
    const attempt = createAttempt({ workspacePath: "/tmp/definitely-missing" });
    const attemptStore = createAttemptStore([attempt]);
    const removeWorkspaceWithResult = vi.fn().mockResolvedValue({
      removed: true,
      preserved: false,
      hadUncommittedChanges: false,
      autoCommitAttempted: false,
      autoCommitSha: null,
      autoCommitError: null,
    });

    const report = await runStartupRecovery({
      attemptStore,
      tracker: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue([createIssue()]),
      },
      workspaceManager: {
        removeWorkspace: vi.fn().mockResolvedValue(undefined),
        removeWorkspaceWithResult,
      },
      getConfig: createConfig,
      launchWorker: vi.fn().mockResolvedValue(undefined),
      logger: { info: vi.fn(), warn: vi.fn() },
      inspectWorkspaceContainers: vi.fn().mockResolvedValue([]),
    });

    expect(report.cleanedUp).toEqual([attempt.attemptId]);
    expect(removeWorkspaceWithResult).toHaveBeenCalledWith(attempt.issueIdentifier, expect.any(Object));
    expect(attemptStore.updateAttempt).toHaveBeenCalledWith(
      attempt.attemptId,
      expect.objectContaining({
        status: "failed",
        errorCode: "recovery_cleanup",
      }),
    );
  });

  it("escalates active workspaces that have no resumable thread id", async () => {
    const workspace = await createTempDir();
    await mkdir(workspace, { recursive: true });
    const attempt = createAttempt({ workspacePath: workspace, threadId: null });
    const attemptStore = createAttemptStore([attempt]);

    const report = await runStartupRecovery({
      attemptStore,
      tracker: {
        fetchIssueStatesByIds: vi.fn().mockResolvedValue([createIssue()]),
      },
      workspaceManager: {
        removeWorkspace: vi.fn().mockResolvedValue(undefined),
      },
      getConfig: createConfig,
      launchWorker: vi.fn().mockResolvedValue(undefined),
      logger: { info: vi.fn(), warn: vi.fn() },
      inspectWorkspaceContainers: vi.fn().mockResolvedValue([]),
    });

    expect(report.escalated).toEqual([attempt.attemptId]);
    expect(attemptStore.updateAttempt).toHaveBeenCalledWith(
      attempt.attemptId,
      expect.objectContaining({
        status: "paused",
        errorCode: "recovery_escalated",
      }),
    );
    expect(attemptStore.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "attempt_recovery_escalated",
      }),
    );
  });
});
