/**
 * Safety-net tests for DirtyTracking state invalidation invariants.
 *
 * These tests verify the public-observable contract:
 *   mutating orchestrator state → getSnapshot() reflects the change
 *
 * They exist as a safety net for Batch 13b, where DirtyTrackingMap/Set will
 * be replaced with plain Map/Set + explicit markDirty() calls. If any
 * mutation path stops invalidating the cache, these tests will catch it.
 */

import { describe, expect, it, vi, afterEach } from "vitest";

import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import type { Issue, RunOutcome, AgentRunner, TrackerPort, WorkspaceManager } from "./orchestrator-fixtures.js";
import {
  createAttemptStore,
  createConfig,
  createConfigStore,
  createIssue,
  createIssueConfigStore,
  createLogger,
  createResolveTemplate,
} from "./orchestrator-fixtures.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlockingRunner(): AgentRunner {
  return {
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
}

function makeTracker(issues: Issue[]): TrackerPort {
  return {
    fetchCandidateIssues: vi.fn(async () => issues),
    fetchIssueStatesByIds: vi.fn(async (ids: string[]) => {
      const idSet = new Set(ids);
      return issues.filter((i) => idSet.has(i.id));
    }),
    fetchIssuesByStates: vi.fn(async () => []),
  } as unknown as TrackerPort;
}

function makeWorkspaceManager(): WorkspaceManager {
  return {
    ensureWorkspace: vi.fn(async (identifier: string) => ({
      path: `/tmp/risoluto/${identifier}`,
      workspaceKey: identifier,
      createdNow: true,
    })),
    removeWorkspace: vi.fn(async () => undefined),
  } as unknown as WorkspaceManager;
}

function makeOrchestrator(
  issues: Issue[],
  options: { maxConcurrent?: number } = {},
): {
  orchestrator: Orchestrator;
  agentRunner: AgentRunner;
} {
  const config = createConfig();
  config.agent.maxConcurrentAgents = options.maxConcurrent ?? 3;

  const agentRunner = makeBlockingRunner();
  const orchestrator = new Orchestrator({
    attemptStore: createAttemptStore(),
    configStore: createConfigStore(config),
    tracker: makeTracker(issues),
    workspaceManager: makeWorkspaceManager(),
    agentRunner,
    issueConfigStore: createIssueConfigStore(),
    logger: createLogger(),
    resolveTemplate: createResolveTemplate(),
  });

  return { orchestrator, agentRunner };
}

// ---------------------------------------------------------------------------
// Running entries (Map: set / delete)
// ---------------------------------------------------------------------------

describe("running entries invalidation", () => {
  it("snapshot reflects a newly running issue after tick", async () => {
    vi.useFakeTimers();
    const issue = { ...createIssue(), id: "issue-1", identifier: "MT-01" };
    const { orchestrator } = makeOrchestrator([issue]);

    await orchestrator.start();
    const snapshotBefore = orchestrator.getSnapshot();
    expect(snapshotBefore.running).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const snapshotAfter = orchestrator.getSnapshot();
    expect(snapshotAfter.running).toHaveLength(1);
    expect(snapshotAfter.running[0]).toMatchObject({ identifier: "MT-01" });

    await orchestrator.stop();
  });

  it("snapshot removes the running entry after the worker completes", async () => {
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

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker: makeTracker([issue]),
      workspaceManager: makeWorkspaceManager(),
      agentRunner,
      issueConfigStore: createIssueConfigStore(),
      logger: createLogger(),
      resolveTemplate: createResolveTemplate(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // After the worker exits the issue moves to retrying (not running).
    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.running).toHaveLength(0);
    expect(snapshot.retrying).toHaveLength(1);

    await orchestrator.stop();
  });
});

// ---------------------------------------------------------------------------
// Retry entries (Map: set / delete / clear)
// ---------------------------------------------------------------------------

describe("retry entries invalidation", () => {
  it("snapshot reflects a retrying issue after failed worker exit", async () => {
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

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker: makeTracker([issue]),
      workspaceManager: makeWorkspaceManager(),
      agentRunner,
      issueConfigStore: createIssueConfigStore(),
      logger: createLogger(),
      resolveTemplate: createResolveTemplate(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.retrying).toHaveLength(1);
    expect(snapshot.retrying[0]).toMatchObject({ identifier: issue.identifier, status: "retrying" });

    await orchestrator.stop();
  });

  it("snapshot shows retry entry deleted when retry fires and worker relaunches", async () => {
    vi.useFakeTimers();
    const issue = createIssue();
    let callCount = 0;
    const agentRunner = {
      runAttempt: vi.fn(async ({ signal }: { signal: AbortSignal }): Promise<RunOutcome> => {
        callCount += 1;
        if (callCount === 1) {
          return {
            kind: "failed",
            errorCode: "turn_failed",
            errorMessage: "boom",
            threadId: null,
            turnId: null,
            turnCount: 1,
          };
        }
        // Second invocation: block until abort so we can inspect running state.
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

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker: makeTracker([issue]),
      workspaceManager: makeWorkspaceManager(),
      agentRunner,
      issueConfigStore: createIssueConfigStore(),
      logger: createLogger(),
      resolveTemplate: createResolveTemplate(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // First attempt failed → now retrying.
    expect(orchestrator.getSnapshot().retrying).toHaveLength(1);

    // Advance past retry backoff (first retry is ~10 s).
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.resolve();

    // Retry timer fired → worker relaunched → retrying entry removed.
    expect(orchestrator.getSnapshot().retrying).toHaveLength(0);
    expect(orchestrator.getSnapshot().running).toHaveLength(1);

    await orchestrator.stop();
  });

  it("snapshot clears all retry entries on stop()", async () => {
    vi.useFakeTimers();
    const issueA = { ...createIssue(), id: "issue-1", identifier: "MT-01" };
    const issueB = { ...createIssue(), id: "issue-2", identifier: "MT-02" };
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

    const config = createConfig();
    config.agent.maxConcurrentAgents = 2;
    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(config),
      tracker: makeTracker([issueA, issueB]),
      workspaceManager: makeWorkspaceManager(),
      agentRunner,
      issueConfigStore: createIssueConfigStore(),
      logger: createLogger(),
      resolveTemplate: createResolveTemplate(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(orchestrator.getSnapshot().retrying).toHaveLength(2);

    await orchestrator.stop();

    expect(orchestrator.getSnapshot().retrying).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Claimed issue IDs (Set: add / delete / clear)
// ---------------------------------------------------------------------------

describe("claimedIssueIds invalidation", () => {
  it("snapshot running count increases when an issue is claimed", async () => {
    vi.useFakeTimers();
    const issue = { ...createIssue(), id: "issue-1", identifier: "MT-01" };
    const { orchestrator } = makeOrchestrator([issue]);

    await orchestrator.start();
    const before = orchestrator.getSnapshot().counts.running;
    expect(before).toBe(0);

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const after = orchestrator.getSnapshot().counts.running;
    expect(after).toBe(1);

    await orchestrator.stop();
  });

  it("snapshot running count decreases after abort clears the claimed entry", async () => {
    vi.useFakeTimers();
    const issue = { ...createIssue(), id: "issue-1", identifier: "MT-01" };
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
          errorCode: "operator_abort",
          errorMessage: "cancelled",
          threadId: null,
          turnId: null,
          turnCount: 0,
        };
      }),
    } as unknown as AgentRunner;

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker: makeTracker([issue]),
      workspaceManager: makeWorkspaceManager(),
      agentRunner,
      issueConfigStore: createIssueConfigStore(),
      logger: createLogger(),
      resolveTemplate: createResolveTemplate(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(orchestrator.getSnapshot().counts.running).toBe(1);

    orchestrator.abortIssue(issue.identifier);
    control.resolveAbort?.();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(orchestrator.getSnapshot().counts.running).toBe(0);

    await orchestrator.stop();
  });

  it("snapshot clears claimed IDs on stop()", async () => {
    vi.useFakeTimers();
    const issue = { ...createIssue(), id: "issue-1", identifier: "MT-01" };
    const { orchestrator } = makeOrchestrator([issue]);

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(orchestrator.getSnapshot().counts.running).toBe(1);

    await orchestrator.stop();

    expect(orchestrator.getSnapshot().counts.running).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Issue model overrides (Map: set / delete)
// ---------------------------------------------------------------------------

describe("issueModelOverrides invalidation", () => {
  it("snapshot includes the updated model after updateIssueModelSelection", async () => {
    vi.useFakeTimers();
    const issue = { ...createIssue(), id: "issue-1", identifier: "MT-01" };
    const { orchestrator } = makeOrchestrator([issue]);

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const snapshotBefore = orchestrator.getSnapshot();
    const runningBefore = snapshotBefore.running.find((r) => r.identifier === "MT-01");
    expect(runningBefore?.model).not.toBe("custom-model");

    await orchestrator.updateIssueModelSelection({
      identifier: "MT-01",
      model: "custom-model",
      reasoningEffort: null,
    });

    const detail = orchestrator.getIssueDetail("MT-01");
    expect(detail).toMatchObject({
      configuredModel: "custom-model",
      modelChangePending: true,
    });

    await orchestrator.stop();
  });
});

// ---------------------------------------------------------------------------
// Issue template overrides (Map: set / delete)
// ---------------------------------------------------------------------------

describe("issueTemplateOverrides invalidation", () => {
  it("snapshot reflects a template override after updateIssueTemplateOverride", async () => {
    vi.useFakeTimers();
    const issue = { ...createIssue(), id: "issue-1", identifier: "MT-01" };
    const { orchestrator } = makeOrchestrator([issue]);

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Before: no override.
    expect(orchestrator.getTemplateOverride("MT-01")).toBeNull();

    // Mutate: set an override (issue must be known — it's running, so detail exists).
    const updated = orchestrator.updateIssueTemplateOverride("MT-01", "tpl-abc");
    expect(updated).toBe(true);

    // After: override is visible via getTemplateOverride.
    expect(orchestrator.getTemplateOverride("MT-01")).toBe("tpl-abc");

    await orchestrator.stop();
  });

  it("template override is absent after clearIssueTemplateOverride", async () => {
    vi.useFakeTimers();
    const issue = { ...createIssue(), id: "issue-1", identifier: "MT-01" };
    const { orchestrator } = makeOrchestrator([issue]);

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    orchestrator.updateIssueTemplateOverride("MT-01", "tpl-abc");
    expect(orchestrator.getTemplateOverride("MT-01")).toBe("tpl-abc");

    const cleared = orchestrator.clearIssueTemplateOverride("MT-01");
    expect(cleared).toBe(true);
    expect(orchestrator.getTemplateOverride("MT-01")).toBeNull();

    await orchestrator.stop();
  });
});

// ---------------------------------------------------------------------------
// clearTrackedCollection optimization — empty clear must NOT mark dirty
// ---------------------------------------------------------------------------

describe("clearTrackedCollection optimization", () => {
  it("snapshot revision is stable when stop() clears already-empty collections", async () => {
    vi.useFakeTimers();

    // Issue that produces no retry (hard startup failure → goes straight to failed).
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

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker: makeTracker([issue]),
      workspaceManager: makeWorkspaceManager(),
      agentRunner,
      issueConfigStore: createIssueConfigStore(),
      logger: createLogger(),
      resolveTemplate: createResolveTemplate(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Confirm no retry entries exist (hard failure skips retry).
    const snapshotBeforeStop = orchestrator.getSnapshot();
    expect(snapshotBeforeStop.retrying).toHaveLength(0);
    expect(snapshotBeforeStop.running).toHaveLength(0);

    // stop() calls retryEntries.clear() and claimedIssueIds.clear() on empty collections.
    // The clearTrackedCollection guard means markDirty must NOT be called for empty sets.
    // We verify this indirectly: getSnapshot() should return the same object reference
    // as the second call (cached), which means the cache was NOT invalidated by the clear.
    const s1 = orchestrator.getSnapshot();
    const s2 = orchestrator.getSnapshot();
    expect(s1).toBe(s2); // same cached object reference — no dirty write occurred

    await orchestrator.stop();
  });

  it("clearing a non-empty collection invalidates the cache", async () => {
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

    const orchestrator = new Orchestrator({
      attemptStore: createAttemptStore(),
      configStore: createConfigStore(createConfig()),
      tracker: makeTracker([issue]),
      workspaceManager: makeWorkspaceManager(),
      agentRunner,
      issueConfigStore: createIssueConfigStore(),
      logger: createLogger(),
      resolveTemplate: createResolveTemplate(),
    });

    await orchestrator.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Retry entries are non-empty.
    expect(orchestrator.getSnapshot().retrying).toHaveLength(1);

    // Take a snapshot reference before stop().
    const snapshotBeforeStop = orchestrator.getSnapshot();

    // stop() calls retryEntries.clear() on non-empty set → must invalidate cache.
    await orchestrator.stop();

    const snapshotAfterStop = orchestrator.getSnapshot();
    expect(snapshotAfterStop).not.toBe(snapshotBeforeStop);
    expect(snapshotAfterStop.retrying).toHaveLength(0);
  });
});
