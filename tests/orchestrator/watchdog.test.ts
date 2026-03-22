import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Watchdog, buildHealthSnapshot } from "../../src/orchestrator/watchdog.js";
import type { StallEvent } from "../../src/orchestrator/stall-detector.js";

function makeCtx(
  overrides: {
    runningCount?: number;
    queuedCount?: number;
    recentStalls?: StallEvent[];
  } = {},
) {
  return {
    getRunningCount: vi.fn(() => overrides.runningCount ?? 0),
    getQueuedCount: vi.fn(() => overrides.queuedCount ?? 0),
    getRecentStalls: vi.fn(() => overrides.recentStalls ?? []),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
}

function makeRecentStall(minsAgo: number): StallEvent {
  return {
    at: new Date(Date.now() - minsAgo * 60_000).toISOString(),
    issueId: "issue-1",
    issueIdentifier: "MT-1",
    silentMs: minsAgo * 60_000,
    timeoutMs: 1_200_000,
  };
}

describe("Watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with 'not started' message before first check", () => {
    const ctx = makeCtx({ runningCount: 1 });
    const watchdog = new Watchdog(ctx, 60_000);
    const health = watchdog.getHealth();
    expect(health.message).toBe("not started");
    expect(health.status).toBe("healthy");
  });

  it("reports healthy when agents are running with no stalls", () => {
    const ctx = makeCtx({ runningCount: 2, queuedCount: 3 });
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    const health = watchdog.getHealth();
    expect(health.status).toBe("healthy");
    expect(health.runningCount).toBe(2);
    expect(health.message).toContain("2 agent(s) running");
    watchdog.stop();
  });

  it("reports healthy idle when no agents and no queue", () => {
    const ctx = makeCtx({ runningCount: 0, queuedCount: 0 });
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    const health = watchdog.getHealth();
    expect(health.status).toBe("healthy");
    expect(health.message).toContain("idle");
    watchdog.stop();
  });

  it("reports critical when no agents running but queue is non-empty", () => {
    const ctx = makeCtx({ runningCount: 0, queuedCount: 5 });
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    const health = watchdog.getHealth();
    expect(health.status).toBe("critical");
    expect(health.message).toContain("5 issue(s) queued");
    watchdog.stop();
  });

  it("reports degraded when there are recent stalls within the window", () => {
    const ctx = makeCtx({ runningCount: 1, recentStalls: [makeRecentStall(2)] }); // 2 min ago
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    const health = watchdog.getHealth();
    expect(health.status).toBe("degraded");
    expect(health.message).toContain("1 stall(s)");
    watchdog.stop();
  });

  it("stalls outside the 5-minute window do not cause degraded status", () => {
    const ctx = makeCtx({ runningCount: 1, recentStalls: [makeRecentStall(10)] }); // 10 min ago
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    const health = watchdog.getHealth();
    // 10 min is outside the 5 min window — should be healthy
    expect(health.status).toBe("healthy");
    watchdog.stop();
  });

  it("prioritizes degraded over critical when both conditions are true", () => {
    const ctx = makeCtx({ runningCount: 0, queuedCount: 3, recentStalls: [makeRecentStall(1)] });
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    const health = watchdog.getHealth();
    expect(health.status).toBe("degraded");
    watchdog.stop();
  });

  it("re-checks on interval", () => {
    const ctx = makeCtx({ runningCount: 1 });
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    expect(ctx.getRunningCount).toHaveBeenCalledTimes(1); // initial check

    vi.advanceTimersByTime(60_000);
    expect(ctx.getRunningCount).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(60_000);
    expect(ctx.getRunningCount).toHaveBeenCalledTimes(3);

    watchdog.stop();
  });

  it("stop() prevents further checks", () => {
    const ctx = makeCtx({ runningCount: 1 });
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    expect(ctx.getRunningCount).toHaveBeenCalledTimes(1);
    watchdog.stop();

    vi.advanceTimersByTime(120_000);
    expect(ctx.getRunningCount).toHaveBeenCalledTimes(1); // no further calls
  });

  it("start() is idempotent — second call is a no-op", () => {
    const ctx = makeCtx({ runningCount: 1 });
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();
    watchdog.start(); // second call should be ignored

    vi.advanceTimersByTime(60_000);
    expect(ctx.getRunningCount).toHaveBeenCalledTimes(2); // initial + one tick, not doubled
    watchdog.stop();
  });

  it("logs warn for degraded/critical, info for healthy", () => {
    const ctx = makeCtx({ runningCount: 0, queuedCount: 3 });
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
    expect(ctx.logger.info).toHaveBeenCalledTimes(0);
    watchdog.stop();
  });

  it("getHealth() returns a copy, not the internal reference", () => {
    const ctx = makeCtx({ runningCount: 1, recentStalls: [makeRecentStall(1)] });
    const watchdog = new Watchdog(ctx, 60_000);
    watchdog.start();

    const h1 = watchdog.getHealth();
    h1.recentStalls.push(makeRecentStall(2));
    const h2 = watchdog.getHealth();

    expect(h2.recentStalls).toHaveLength(1); // mutation didn't affect internal state
    watchdog.stop();
  });
});

describe("buildHealthSnapshot", () => {
  it("returns a plain object with the expected shape", () => {
    const stall = makeRecentStall(1);
    const snapshot = buildHealthSnapshot({
      status: "degraded",
      checkedAt: "2026-03-22T12:00:00.000Z",
      runningCount: 2,
      recentStalls: [stall],
      message: "1 stall(s) detected",
    });

    expect(snapshot["status"]).toBe("degraded");
    expect(snapshot["checkedAt"]).toBe("2026-03-22T12:00:00.000Z");
    expect(snapshot["runningCount"]).toBe(2);
    expect(snapshot["message"]).toBe("1 stall(s) detected");
    expect(Array.isArray(snapshot["recentStalls"])).toBe(true);
  });
});
