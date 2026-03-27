import { describe, expect, it, vi } from "vitest";

import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";
import type { TokenUsageSnapshot } from "../../src/core/types.js";

/**
 * The delegate functions are not re-exported from the module, but the key pure logic
 * (pushRecentEvent truncation, applyUsageEvent math, notifyChannel guard) is exercised
 * by importing buildCtx and constructing a minimal OrchestratorState.
 * We test the buildCtx-produced context methods here.
 */
import { buildCtx, type OrchestratorState } from "../../src/orchestrator/orchestrator-delegates.js";
import type { OrchestratorDeps } from "../../src/orchestrator/runtime-types.js";

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    running: true,
    runningEntries: new Map(),
    retryEntries: new Map(),
    completedViews: new Map(),
    detailViews: new Map(),
    claimedIssueIds: new Set(),
    queuedViews: [],
    recentEvents: [],
    rateLimits: null,
    issueModelOverrides: new Map(),
    sessionUsageTotals: new Map(),
    codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    attemptStore: {} as never,
    configStore: {
      getConfig: () =>
        ({
          tracker: { activeStates: ["In Progress"], terminalStates: ["Done"] },
          agent: { maxConcurrentAgents: 5, maxConcurrentAgentsByState: {} },
          codex: { model: "gpt-4o", reasoningEffort: "high" },
        }) as never,
      getWorkflow: () => ({ promptTemplate: "Work on it" }),
    } as never,
    tracker: {} as never,
    workspaceManager: {} as never,
    agentRunner: {} as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as never,
    ...overrides,
  };
}

describe("buildCtx — pushEvent", () => {
  it("appends events to recentEvents", () => {
    const state = makeState();
    const ctx = buildCtx(state, makeDeps());
    ctx.pushEvent({
      at: "2024-01-01T00:00:00Z",
      issueId: "i1",
      issueIdentifier: "MT-1",
      sessionId: null,
      event: "test",
      message: "hello",
    });
    expect(state.recentEvents.length).toBe(1);
    expect(state.recentEvents[0].event).toBe("test");
  });

  it("truncates recentEvents to 250 items", () => {
    const state = makeState({
      recentEvents: Array.from({ length: 250 }, (_, i) => ({
        at: `t${i}`,
        issueId: "i",
        issueIdentifier: "MT-1",
        sessionId: null,
        event: `ev-${i}`,
        message: `m-${i}`,
        content: null,
      })),
    });
    const ctx = buildCtx(state, makeDeps());
    ctx.pushEvent({
      at: "new",
      issueId: "i",
      issueIdentifier: "MT-1",
      sessionId: null,
      event: "new-event",
      message: "new msg",
    });
    expect(state.recentEvents.length).toBe(250);
    expect(state.recentEvents[249].event).toBe("new-event");
  });
});

describe("buildCtx — applyUsageEvent", () => {
  function makeEntry(sessionId: string | null = "sess-1"): RunningEntry {
    return {
      runId: "r1",
      sessionId,
      tokenUsage: null,
    } as unknown as RunningEntry;
  }

  it("accumulates delta usage correctly", () => {
    const state = makeState();
    const ctx = buildCtx(state, makeDeps());
    const entry = makeEntry();
    const usage: TokenUsageSnapshot = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    ctx.applyUsageEvent(entry, usage, "delta");
    expect(state.codexTotals.inputTokens).toBe(10);
    expect(state.codexTotals.outputTokens).toBe(5);
    expect(entry.tokenUsage).toEqual(usage);

    // Second delta accumulates
    ctx.applyUsageEvent(entry, usage, "delta");
    expect(state.codexTotals.inputTokens).toBe(20);
    expect(entry.tokenUsage!.inputTokens).toBe(20);
  });

  it("computes delta from absolute_total mode using session tracking", () => {
    const state = makeState();
    const ctx = buildCtx(state, makeDeps());
    const entry = makeEntry("sess-A");

    const first: TokenUsageSnapshot = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
    ctx.applyUsageEvent(entry, first, "absolute_total");
    expect(state.codexTotals.inputTokens).toBe(100);
    expect(state.sessionUsageTotals.get("sess-A")).toEqual(first);

    // Second absolute — delta should be the difference
    const second: TokenUsageSnapshot = { inputTokens: 180, outputTokens: 90, totalTokens: 270 };
    ctx.applyUsageEvent(entry, second, "absolute_total");
    expect(state.codexTotals.inputTokens).toBe(180); // 100 + (180-100)
    expect(state.codexTotals.outputTokens).toBe(90);
  });

  it("handles absolute_total with null sessionId", () => {
    const state = makeState();
    const ctx = buildCtx(state, makeDeps());
    const entry = makeEntry(null);
    const usage: TokenUsageSnapshot = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    ctx.applyUsageEvent(entry, usage, "absolute_total");
    // With no session, delta is computed from null previous → full usage
    expect(state.codexTotals.inputTokens).toBe(10);
  });
});

describe("buildCtx — notify", () => {
  it("does not throw when notificationManager is absent", () => {
    const state = makeState();
    const ctx = buildCtx(state, makeDeps({ notificationManager: undefined }));
    expect(() => ctx.notify({ type: "worker_launched" } as never)).not.toThrow();
  });

  it("delegates to notificationManager.notify when present", () => {
    const notifyFn = vi.fn();
    const state = makeState();
    const ctx = buildCtx(
      state,
      makeDeps({
        notificationManager: { notify: notifyFn } as never,
      }),
    );
    ctx.notify({ type: "worker_launched" } as never);
    expect(notifyFn).toHaveBeenCalled();
  });
});

describe("buildCtx — setQueuedViews / getQueuedViews", () => {
  it("round-trips queued views through state", () => {
    const state = makeState();
    const ctx = buildCtx(state, makeDeps());
    const views = [{ issueId: "i1" }] as never;
    ctx.setQueuedViews(views);
    expect(state.queuedViews).toBe(views);
  });
});

describe("buildCtx — setRateLimits", () => {
  it("stores rate limits on state", () => {
    const state = makeState();
    const ctx = buildCtx(state, makeDeps());
    ctx.setRateLimits({ remaining: 100 });
    expect(state.rateLimits).toEqual({ remaining: 100 });
  });
});

describe("buildCtx — pushEvent → eventBus routing", () => {
  function makeEventBus() {
    return { emit: vi.fn() };
  }

  function pushLifecycleEvent(eventName: string, issueId = "i1", issueIdentifier = "MT-1") {
    const bus = makeEventBus();
    const ctx = buildCtx(makeState(), makeDeps({ eventBus: bus as never }));
    ctx.pushEvent({
      at: "2024-01-01T00:00:00Z",
      issueId,
      issueIdentifier,
      sessionId: null,
      event: eventName,
      message: `${eventName} message`,
    });
    return bus.emit.mock.calls;
  }

  it("routes agent_stalled to issue.stalled SSE channel", () => {
    const calls = pushLifecycleEvent("agent_stalled");
    const stalledCall = calls.find((c) => c[0] === "issue.stalled");
    expect(stalledCall).toBeDefined();
    expect(stalledCall![1]).toMatchObject({ issueId: "i1", identifier: "MT-1" });
  });

  it("routes worker_stalled to issue.stalled SSE channel", () => {
    const calls = pushLifecycleEvent("worker_stalled");
    expect(calls.find((c) => c[0] === "issue.stalled")).toBeDefined();
  });

  it("routes worker_failed to worker.failed SSE channel", () => {
    const calls = pushLifecycleEvent("worker_failed");
    const failedCall = calls.find((c) => c[0] === "worker.failed");
    expect(failedCall).toBeDefined();
    expect(failedCall![1]).toMatchObject({ issueId: "i1", identifier: "MT-1" });
  });

  it("routes issue_queued to issue.queued SSE channel", () => {
    const calls = pushLifecycleEvent("issue_queued");
    const queuedCall = calls.find((c) => c[0] === "issue.queued");
    expect(queuedCall).toBeDefined();
    expect(queuedCall![1]).toMatchObject({ issueId: "i1", identifier: "MT-1" });
  });

  it("always also emits agent.event for all events", () => {
    for (const evName of ["agent_stalled", "worker_failed", "issue_queued", "some_other_event"]) {
      const calls = pushLifecycleEvent(evName);
      expect(calls.find((c) => c[0] === "agent.event")).toBeDefined();
    }
  });

  it("does not throw when eventBus is absent", () => {
    const ctx = buildCtx(makeState(), makeDeps({ eventBus: undefined }));
    expect(() =>
      ctx.pushEvent({
        at: "2024-01-01T00:00:00Z",
        issueId: "i1",
        issueIdentifier: "MT-1",
        sessionId: null,
        event: "worker_failed",
        message: "boom",
      }),
    ).not.toThrow();
  });
});
