import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import type { OutcomeContext } from "../../src/orchestrator/context.js";
import type { RunOutcome, RuntimeIssueView, ServiceConfig } from "../../src/core/types.js";
import type { RetryRuntimeEntry, RunningEntry } from "../../src/orchestrator/runtime-types.js";
import type { PreparedWorkerOutcome } from "../../src/orchestrator/worker-outcome/types.js";
import { buildOutcomeView } from "../../src/orchestrator/outcome-view-builder.js";
import { computeBackoffForAttempt, createRetryCoordinator } from "../../src/orchestrator/retry-coordinator.js";
import { createIssue, createWorkspace, createModelSelection, createRunningEntry } from "./issue-test-factories.js";
import { attachOutcomeRuntimeFinalizers } from "./outcome-runtime-finalizers.js";

afterEach(() => {
  vi.useRealTimers();
});

function makeConfig(): ServiceConfig {
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
    },
  } as unknown as ServiceConfig;
}

function makePrepared(outcome: RunOutcome, attempt: number | null): PreparedWorkerOutcome {
  const issue = createIssue();
  const entry = createRunningEntry();
  const workspace = createWorkspace();
  const modelSelection = createModelSelection();
  return { outcome, entry, issue, latestIssue: issue, workspace, attempt, modelSelection };
}

function makeHarness(isRunning = true) {
  const config = makeConfig();
  const runningEntries = new Map<string, RunningEntry>();
  const retryEntries = new Map<string, RetryRuntimeEntry>();
  const detailViews = new Map<string, RuntimeIssueView>();
  const completedViews = new Map<string, RuntimeIssueView>();
  const releaseIssueClaim = vi.fn();
  const notify = vi.fn();
  const markDirty = vi.fn();
  const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());
  const launchWorker = vi.fn().mockResolvedValue(undefined);
  const attemptStore = {
    updateAttempt: vi.fn().mockResolvedValue(undefined),
    createAttempt: vi.fn().mockResolvedValue(undefined),
  };
  const tracker = {
    fetchIssueStatesByIds: vi.fn().mockResolvedValue([createIssue()]),
    resolveStateId: vi.fn().mockResolvedValue(null),
    updateIssueState: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue(undefined),
  };
  const workspaceManager = {
    removeWorkspace: vi.fn().mockResolvedValue(undefined),
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const ctx = {
    runningEntries,
    completedViews,
    detailViews,
    deps: {
      tracker,
      attemptStore,
      workspaceManager,
      eventBus: { emit: vi.fn() },
      logger,
    },
    isRunning: () => isRunning,
    getConfig: () => config,
    releaseIssueClaim,
    markDirty,
    buildOutcomeView: (input) =>
      buildOutcomeView(input.issue, input.workspace, input.entry, input.configuredSelection, input.overrides),
    setDetailView: (identifier, view) => {
      detailViews.set(identifier, view);
      markDirty();
      return view;
    },
    setCompletedView: (identifier, view) => {
      completedViews.set(identifier, view);
      markDirty();
      return view;
    },
    resolveModelSelection,
    notify,
  } as OutcomeContext;

  attachOutcomeRuntimeFinalizers(ctx, { retryEntries });

  ctx.retryCoordinator = createRetryCoordinator(
    {
      tracker,
      attemptStore,
      workspaceManager,
      logger,
    },
    {
      runningEntries,
      retryEntries,
      detailViews,
      completedViews,
      isRunning: () => isRunning,
      getConfig: () => config,
      claimIssue: vi.fn(),
      releaseIssueClaim,
      hasAvailableStateSlot: vi.fn().mockReturnValue(true),
      markDirty,
      notify,
      pushEvent: vi.fn(),
      resolveModelSelection,
      setDetailView: (identifier, view) => {
        detailViews.set(identifier, view);
        markDirty();
        return view;
      },
      setCompletedView: (identifier, view) => {
        completedViews.set(identifier, view);
        markDirty();
        return view;
      },
      launchWorker,
    },
  );

  return { ctx, retryEntries, runningEntries, releaseIssueClaim, notify };
}

describe("computeBackoffForAttempt properties", () => {
  const attemptArb = fc.integer({ min: 0, max: 30 });
  const maxBackoffArb = fc.integer({ min: 1, max: 600_000 });

  it("delay never exceeds maxRetryBackoffMs", () => {
    fc.assert(
      fc.property(attemptArb, maxBackoffArb, (attempt, maxBackoff) => {
        expect(computeBackoffForAttempt(attempt, maxBackoff)).toBeLessThanOrEqual(maxBackoff);
      }),
    );
  });

  it("delay is always positive", () => {
    fc.assert(
      fc.property(attemptArb, maxBackoffArb, (attempt, maxBackoff) => {
        expect(computeBackoffForAttempt(attempt, maxBackoff)).toBeGreaterThan(0);
      }),
    );
  });

  it("delay is monotonically non-decreasing across attempts", () => {
    fc.assert(
      fc.property(maxBackoffArb, (maxBackoff) => {
        let previousDelay = 0;
        for (let attempt = 0; attempt <= 20; attempt++) {
          const delay = computeBackoffForAttempt(attempt, maxBackoff);
          expect(delay).toBeGreaterThanOrEqual(previousDelay);
          previousDelay = delay;
        }
      }),
    );
  });

  it("delay is always a finite number", () => {
    fc.assert(
      fc.property(attemptArb, maxBackoffArb, (attempt, maxBackoff) => {
        expect(Number.isFinite(computeBackoffForAttempt(attempt, maxBackoff))).toBe(true);
      }),
    );
  });

  it("base delay at attempt 0 is 10_000ms when the cap allows it", () => {
    fc.assert(
      fc.property(
        maxBackoffArb.filter((maxBackoff) => maxBackoff >= 20_000),
        (maxBackoff) => {
          expect(computeBackoffForAttempt(0, maxBackoff)).toBe(10_000);
        },
      ),
    );
  });

  it("delay doubles with each attempt until capped", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 15 }), (attempt) => {
        const current = computeBackoffForAttempt(attempt, 10_000_000);
        const next = computeBackoffForAttempt(attempt + 1, 10_000_000);
        expect(next === current * 2 || next === 10_000_000).toBe(true);
      }),
    );
  });

  it("small caps clamp the computed delay", () => {
    fc.assert(
      fc.property(attemptArb, (attempt) => {
        expect(computeBackoffForAttempt(attempt, 1)).toBe(1);
      }),
    );
  });

  it("the default cap still produces a finite positive delay", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (attempt) => {
        const delay = computeBackoffForAttempt(attempt, 300_000);
        expect(delay).toBeLessThanOrEqual(300_000);
        expect(delay).toBeGreaterThan(0);
      }),
    );
  });
});

describe("RetryCoordinator queue invariants", () => {
  it("queued entry attempt matches the input attempt for model override retries", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (attempt) => {
        vi.useFakeTimers();
        const harness = makeHarness();

        await harness.ctx.retryCoordinator.dispatch(
          harness.ctx,
          makePrepared(
            {
              kind: "cancelled",
              errorCode: "model_override_updated",
              errorMessage: null,
              threadId: null,
              turnId: null,
              turnCount: 1,
            },
            attempt,
          ),
        );

        expect(harness.retryEntries.get("issue-1")?.attempt).toBe(attempt);
        vi.useRealTimers();
      }),
    );
  });

  it("queued entry dueAtMs is always in the future for policy-driven retries", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 60_000 }), async (delayMs) => {
        vi.useFakeTimers();
        const before = Date.now();
        const harness = makeHarness();

        await harness.ctx.retryCoordinator.dispatch(
          harness.ctx,
          makePrepared(
            {
              kind: "failed",
              errorCode: "turn_failed",
              errorMessage: null,
              threadId: null,
              turnId: null,
              turnCount: 1,
              codexErrorInfo: { type: "RateLimited", message: "wait", retryAfterMs: delayMs },
            },
            1,
          ),
        );

        expect(harness.retryEntries.get("issue-1")?.dueAtMs).toBeGreaterThanOrEqual(before);
        vi.useRealTimers();
      }),
    );
  });

  it("notification is emitted for queued retries", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (attempt) => {
        vi.useFakeTimers();
        const harness = makeHarness();

        await harness.ctx.retryCoordinator.dispatch(
          harness.ctx,
          makePrepared(
            {
              kind: "cancelled",
              errorCode: "model_override_updated",
              errorMessage: null,
              threadId: null,
              turnId: null,
              turnCount: 1,
            },
            attempt,
          ),
        );

        expect(harness.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_retry", attempt }));
        vi.useRealTimers();
      }),
    );
  });

  it("dispatch is a no-op when the orchestrator is not running", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (attempt) => {
        vi.useFakeTimers();
        const harness = makeHarness(false);

        await harness.ctx.retryCoordinator.dispatch(
          harness.ctx,
          makePrepared(
            {
              kind: "cancelled",
              errorCode: "model_override_updated",
              errorMessage: null,
              threadId: null,
              turnId: null,
              turnCount: 1,
            },
            attempt,
          ),
        );

        expect(harness.retryEntries.size).toBe(0);
        expect(harness.notify).not.toHaveBeenCalled();
        vi.useRealTimers();
      }),
    );
  });
});

describe("RetryCoordinator cancel invariants", () => {
  it("cancel always removes the entry from the map", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (attempt) => {
        vi.useFakeTimers();
        const harness = makeHarness();

        await harness.ctx.retryCoordinator.dispatch(
          harness.ctx,
          makePrepared(
            {
              kind: "cancelled",
              errorCode: "model_override_updated",
              errorMessage: null,
              threadId: null,
              turnId: null,
              turnCount: 1,
            },
            attempt,
          ),
        );
        harness.ctx.retryCoordinator.cancel("issue-1");

        expect(harness.retryEntries.has("issue-1")).toBe(false);
        vi.useRealTimers();
      }),
    );
  });

  it("cancel is safe for any issueId", () => {
    fc.assert(
      fc.property(fc.string(), (issueId) => {
        const harness = makeHarness();
        expect(() => harness.ctx.retryCoordinator.cancel(issueId)).not.toThrow();
      }),
    );
  });

  it("claim is released only when no running entry exists", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (hasRunningEntry) => {
        vi.useFakeTimers();
        const harness = makeHarness();
        if (hasRunningEntry) {
          harness.runningEntries.set("issue-1", createRunningEntry({ issue: createIssue() }));
        }

        await harness.ctx.retryCoordinator.dispatch(
          harness.ctx,
          makePrepared(
            {
              kind: "cancelled",
              errorCode: "model_override_updated",
              errorMessage: null,
              threadId: null,
              turnId: null,
              turnCount: 1,
            },
            1,
          ),
        );
        harness.releaseIssueClaim.mockClear();

        harness.ctx.retryCoordinator.cancel("issue-1");

        if (hasRunningEntry) {
          expect(harness.releaseIssueClaim).not.toHaveBeenCalled();
        } else {
          expect(harness.releaseIssueClaim).toHaveBeenCalledWith("issue-1");
        }
        vi.useRealTimers();
      }),
    );
  });
});
