import { describe, expect, it, vi, beforeEach } from "vitest";
import { detectAndKillStalledWorkers } from "../../src/orchestrator/stall-detector.js";
import type { StallDetectorContext, StallEvent } from "../../src/orchestrator/stall-detector.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";
import type { ServiceConfig } from "../../src/core/types.js";

function makeConfig(stallTimeoutMs: number): ServiceConfig {
  return {
    tracker: { kind: "linear", apiKey: "k", endpoint: "e", projectSlug: null, activeStates: [], terminalStates: [] },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 },
    },
    agent: {
      maxConcurrentAgents: 2,
      maxConcurrentAgentsByState: {},
      maxTurns: 2,
      maxRetryBackoffMs: 300000,
      maxContinuationAttempts: 5,
      successState: null,
      stallTimeoutMs,
    },
    codex: {
      command: "codex",
      model: "gpt-5",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 5000,
      stallTimeoutMs: 300000,
      auth: { mode: "api_key", sourceHome: "/tmp" },
      provider: null,
      sandbox: {
        image: "node:22",
        network: "none",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: { memory: "1g", memoryReservation: "512m", memorySwap: "2g", cpus: "1", tmpfsSize: "100m" },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    server: { port: 4000 },
  } as ServiceConfig;
}

function makeEntry(overrides: Partial<Pick<RunningEntry, "lastEventAtMs" | "abortController" | "status">> & { id?: string; identifier?: string } = {}): RunningEntry {
  const ac = overrides.abortController ?? new AbortController();
  return {
    runId: "run-1",
    issue: {
      id: overrides.id ?? "issue-1",
      identifier: overrides.identifier ?? "MT-1",
      title: "Test issue",
      description: null,
      priority: null,
      state: "In Progress",
      branchName: null,
      url: null,
      labels: [],
      blockedBy: [],
      createdAt: null,
      updatedAt: null,
    },
    workspace: { path: "/tmp/ws", workspaceKey: "ws-1", createdNow: false },
    startedAtMs: Date.now() - 60000,
    lastEventAtMs: overrides.lastEventAtMs ?? Date.now(),
    attempt: 1,
    abortController: ac,
    promise: Promise.resolve(),
    cleanupOnExit: false,
    status: overrides.status ?? "running",
    sessionId: "sess-1",
    tokenUsage: null,
    modelSelection: { model: "gpt-5", reasoningEffort: null, source: "default" },
    lastAgentMessageContent: null,
    repoMatch: null,
    queuePersistence: () => {},
    flushPersistence: async () => {},
  } as RunningEntry;
}

function makeCtx(
  entries: RunningEntry[],
  stallTimeoutMs: number,
  stallEventsArr: StallEvent[] = [],
): StallDetectorContext & { pushedEvents: unknown[]; warnCalls: unknown[][] } {
  const pushedEvents: unknown[] = [];
  const warnCalls: unknown[][] = [];
  const runningEntries = new Map(entries.map((e) => [e.runId, e]));
  return {
    runningEntries,
    stallEvents: stallEventsArr,
    getConfig: () => makeConfig(stallTimeoutMs),
    pushEvent: (ev) => pushedEvents.push(ev),
    logger: { warn: (...args) => warnCalls.push(args) },
    pushedEvents,
    warnCalls,
  };
}

describe("detectAndKillStalledWorkers", () => {
  it("returns 0 and does nothing when stallTimeoutMs is 0 (disabled)", () => {
    const entry = makeEntry({ lastEventAtMs: Date.now() - 9999999 });
    const ctx = makeCtx([entry], 0);
    const killed = detectAndKillStalledWorkers(ctx);
    expect(killed).toBe(0);
    expect(entry.abortController.signal.aborted).toBe(false);
    expect(ctx.pushedEvents).toHaveLength(0);
  });

  it("returns 0 when no entries exceed the timeout", () => {
    const entry = makeEntry({ lastEventAtMs: Date.now() - 5000 });
    const ctx = makeCtx([entry], 60000);
    const killed = detectAndKillStalledWorkers(ctx);
    expect(killed).toBe(0);
    expect(entry.abortController.signal.aborted).toBe(false);
  });

  it("aborts and records stall event for a timed-out entry", () => {
    const entry = makeEntry({ lastEventAtMs: Date.now() - 120000, id: "issue-42", identifier: "MT-42" });
    const stallEvents: StallEvent[] = [];
    const ctx = makeCtx([entry], 60000, stallEvents);

    const killed = detectAndKillStalledWorkers(ctx);

    expect(killed).toBe(1);
    expect(entry.abortController.signal.aborted).toBe(true);
    expect(entry.status).toBe("stopping");
    expect(stallEvents).toHaveLength(1);
    expect(stallEvents[0].issueId).toBe("issue-42");
    expect(stallEvents[0].issueIdentifier).toBe("MT-42");
    expect(stallEvents[0].silentMs).toBeGreaterThanOrEqual(120000);
    expect(stallEvents[0].timeoutMs).toBe(60000);
  });

  it("pushes an agent_stalled event for each stalled entry", () => {
    const entry = makeEntry({ lastEventAtMs: Date.now() - 120000 });
    const ctx = makeCtx([entry], 60000);

    detectAndKillStalledWorkers(ctx);

    expect(ctx.pushedEvents).toHaveLength(1);
    const ev = ctx.pushedEvents[0] as Record<string, unknown>;
    expect(ev["event"]).toBe("agent_stalled");
    expect(ev["issueIdentifier"]).toBe("MT-1");
  });

  it("logs a warning for each stalled entry", () => {
    const entry = makeEntry({ lastEventAtMs: Date.now() - 120000 });
    const ctx = makeCtx([entry], 60000);

    detectAndKillStalledWorkers(ctx);

    expect(ctx.warnCalls).toHaveLength(1);
  });

  it("skips entries that are already aborted", () => {
    const ac = new AbortController();
    ac.abort("already done");
    const entry = makeEntry({ lastEventAtMs: Date.now() - 999999, abortController: ac });
    const ctx = makeCtx([entry], 60000);

    const killed = detectAndKillStalledWorkers(ctx);

    expect(killed).toBe(0);
    expect(ctx.pushedEvents).toHaveLength(0);
  });

  it("handles multiple entries, killing only the stalled ones", () => {
    const fresh = makeEntry({ lastEventAtMs: Date.now() - 5000, id: "issue-1", identifier: "MT-1" });
    const stalled = makeEntry({ lastEventAtMs: Date.now() - 120000, id: "issue-2", identifier: "MT-2" });
    stalled.runId = "run-2";

    const runningEntries = new Map([
      ["run-1", fresh],
      ["run-2", stalled],
    ]);
    const pushedEvents: unknown[] = [];
    const ctx: StallDetectorContext & { pushedEvents: unknown[] } = {
      runningEntries,
      stallEvents: [],
      getConfig: () => makeConfig(60000),
      pushEvent: (ev) => pushedEvents.push(ev),
      logger: { warn: vi.fn() },
      pushedEvents,
    };

    const killed = detectAndKillStalledWorkers(ctx);

    expect(killed).toBe(1);
    expect(fresh.abortController.signal.aborted).toBe(false);
    expect(stalled.abortController.signal.aborted).toBe(true);
  });

  it("caps stallEvents array at 100 entries", () => {
    // Fill up to 100 existing stall events
    const existing: StallEvent[] = Array.from({ length: 100 }, (_, i) => ({
      at: new Date().toISOString(),
      issueId: `issue-${i}`,
      issueIdentifier: `MT-${i}`,
      silentMs: 120000,
      timeoutMs: 60000,
    }));

    const entry = makeEntry({ lastEventAtMs: Date.now() - 120000 });
    const ctx = makeCtx([entry], 60000, existing);

    detectAndKillStalledWorkers(ctx);

    expect(ctx.stallEvents).toHaveLength(100);
    // The new entry was appended and the oldest was shifted out
    expect(ctx.stallEvents.at(-1)?.issueIdentifier).toBe("MT-1");
  });
});
