import { describe, expect, it, vi, afterEach } from "vitest";
import fc from "fast-check";

import { clearRetryEntry, queueRetry } from "../../src/orchestrator/retry-manager.js";
import type { Issue } from "../../src/core/types.js";
import type { RetryRuntimeEntry, RunningEntry } from "../../src/orchestrator/runtime-types.js";

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Extracted backoff formula matching `handleErrorRetry` in retry-paths.ts:
 *   Math.min(10_000 * 2 ** Math.max(0, nextAttempt - 1), maxRetryBackoffMs)
 */
function computeRetryDelay(attempt: number, maxRetryBackoffMs: number): number {
  const nextAttempt = attempt + 1;
  return Math.min(10_000 * 2 ** Math.max(0, nextAttempt - 1), maxRetryBackoffMs);
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "MT-1",
    title: "Test issue",
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

describe("retry backoff formula properties", () => {
  /** Arbitrary for attempt numbers (0-based, reasonable upper bound to avoid Infinity). */
  const attemptArb = fc.integer({ min: 0, max: 30 });
  /** Arbitrary for max backoff config (must be positive). */
  const maxBackoffArb = fc.integer({ min: 1, max: 600_000 });

  it("property: delay never exceeds maxRetryBackoffMs", () => {
    fc.assert(
      fc.property(attemptArb, maxBackoffArb, (attempt, maxBackoff) => {
        const delay = computeRetryDelay(attempt, maxBackoff);
        expect(delay).toBeLessThanOrEqual(maxBackoff);
      }),
    );
  });

  it("property: delay is always positive", () => {
    fc.assert(
      fc.property(attemptArb, maxBackoffArb, (attempt, maxBackoff) => {
        const delay = computeRetryDelay(attempt, maxBackoff);
        expect(delay).toBeGreaterThan(0);
      }),
    );
  });

  it("property: delay is monotonically non-decreasing across attempts", () => {
    fc.assert(
      fc.property(maxBackoffArb, (maxBackoff) => {
        let previousDelay = 0;
        for (let attempt = 0; attempt <= 20; attempt++) {
          const delay = computeRetryDelay(attempt, maxBackoff);
          expect(delay).toBeGreaterThanOrEqual(previousDelay);
          previousDelay = delay;
        }
      }),
    );
  });

  it("property: delay is always a finite number", () => {
    fc.assert(
      fc.property(attemptArb, maxBackoffArb, (attempt, maxBackoff) => {
        const delay = computeRetryDelay(attempt, maxBackoff);
        expect(Number.isFinite(delay)).toBe(true);
      }),
    );
  });

  it("property: base delay at attempt 0 is 10_000ms (capped by max)", () => {
    fc.assert(
      fc.property(
        maxBackoffArb.filter((max) => max >= 20_000),
        (maxBackoff) => {
          // attempt=0 -> nextAttempt=1 -> exponent=max(0,0)=0 -> 10_000 * 2^0 = 10_000
          const delay = computeRetryDelay(0, maxBackoff);
          expect(delay).toBe(10_000);
        },
      ),
    );
  });

  it("property: delay doubles with each attempt until capped", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 15 }),
        fc.constant(10_000_000), // very high cap so we see doubling
        (attempt, maxBackoff) => {
          const current = computeRetryDelay(attempt, maxBackoff);
          const next = computeRetryDelay(attempt + 1, maxBackoff);
          // Either the next delay is exactly double, or both are capped at maxBackoff
          expect(next === current * 2 || next === maxBackoff).toBe(true);
        },
      ),
    );
  });

  it("property: zero maxBackoff would still produce capped-at-max delay", () => {
    fc.assert(
      fc.property(attemptArb, (attempt) => {
        // When maxBackoff is very small, delay is clamped to it
        const delay = computeRetryDelay(attempt, 1);
        expect(delay).toBe(1);
      }),
    );
  });

  it("property: default maxRetryBackoffMs=300_000 caps the delay", () => {
    const defaultMax = 300_000;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (attempt) => {
        const delay = computeRetryDelay(attempt, defaultMax);
        expect(delay).toBeLessThanOrEqual(defaultMax);
        expect(delay).toBeGreaterThan(0);
      }),
    );
  });
});

describe("queueRetry property invariants", () => {
  function makeQueueCtx() {
    vi.useFakeTimers();
    return {
      isRunning: () => true,
      claimIssue: vi.fn(),
      retryEntries: new Map<string, RetryRuntimeEntry>(),
      detailViews: new Map<string, { workspaceKey: string | null }>(),
      notify: vi.fn(),
      revalidateAndLaunchRetry: vi.fn().mockResolvedValue(undefined),
      handleRetryLaunchFailure: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("property: queued entry attempt matches the input attempt", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (attempt) => {
        vi.useFakeTimers();
        const ctx = makeQueueCtx();
        queueRetry(ctx, makeIssue(), attempt, 1000, null);
        const entry = ctx.retryEntries.get("issue-1");
        expect(entry?.attempt).toBe(attempt);
        vi.useRealTimers();
      }),
    );
  });

  it("property: queued entry dueAtMs is always in the future", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 600_000 }), (delayMs) => {
        vi.useFakeTimers();
        const before = Date.now();
        const ctx = makeQueueCtx();
        queueRetry(ctx, makeIssue(), 1, delayMs, null);
        const entry = ctx.retryEntries.get("issue-1");
        expect(entry?.dueAtMs).toBeGreaterThanOrEqual(before);
        vi.useRealTimers();
      }),
    );
  });

  it("property: notification is always emitted for queued retries", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 60_000 }), (attempt, delayMs) => {
        vi.useFakeTimers();
        const ctx = makeQueueCtx();
        queueRetry(ctx, makeIssue(), attempt, delayMs, null);
        expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "worker_retry", attempt }));
        vi.useRealTimers();
      }),
    );
  });

  it("property: queueRetry is a no-op when orchestrator is not running", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 60_000 }), (attempt, delayMs) => {
        vi.useFakeTimers();
        const ctx = makeQueueCtx();
        ctx.isRunning = () => false;
        queueRetry(ctx, makeIssue(), attempt, delayMs, null);
        expect(ctx.retryEntries.size).toBe(0);
        expect(ctx.claimIssue).not.toHaveBeenCalled();
        expect(ctx.notify).not.toHaveBeenCalled();
        vi.useRealTimers();
      }),
    );
  });
});

describe("clearRetryEntry property invariants", () => {
  it("property: clearing always removes the entry from the map", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (issueId) => {
        const entry: RetryRuntimeEntry = {
          issueId,
          identifier: "MT-1",
          attempt: 1,
          dueAtMs: Date.now() + 5000,
          error: null,
          timer: null,
          issue: makeIssue({ id: issueId }),
          workspaceKey: null,
        };
        const retryEntries = new Map([[issueId, entry]]);
        const runningEntries = new Map<string, RunningEntry>();
        const releaseIssueClaim = vi.fn();

        clearRetryEntry({ retryEntries, runningEntries, releaseIssueClaim }, issueId);
        expect(retryEntries.has(issueId)).toBe(false);
      }),
    );
  });

  it("property: clearing is safe for any issueId (never throws)", () => {
    fc.assert(
      fc.property(fc.string(), (issueId) => {
        const retryEntries = new Map<string, RetryRuntimeEntry>();
        const runningEntries = new Map<string, RunningEntry>();
        const releaseIssueClaim = vi.fn();

        expect(() => clearRetryEntry({ retryEntries, runningEntries, releaseIssueClaim }, issueId)).not.toThrow();
      }),
    );
  });

  it("property: claim is released only when no running entry exists", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), fc.boolean(), (issueId, hasRunning) => {
        const entry: RetryRuntimeEntry = {
          issueId,
          identifier: "MT-1",
          attempt: 1,
          dueAtMs: Date.now() + 5000,
          error: null,
          timer: null,
          issue: makeIssue({ id: issueId }),
          workspaceKey: null,
        };
        const retryEntries = new Map([[issueId, entry]]);
        const runningEntries = new Map<string, RunningEntry>();
        if (hasRunning) {
          runningEntries.set(issueId, {} as RunningEntry);
        }
        const releaseIssueClaim = vi.fn();

        clearRetryEntry({ retryEntries, runningEntries, releaseIssueClaim }, issueId);

        if (hasRunning) {
          expect(releaseIssueClaim).not.toHaveBeenCalled();
        } else {
          expect(releaseIssueClaim).toHaveBeenCalledWith(issueId);
        }
      }),
    );
  });
});
