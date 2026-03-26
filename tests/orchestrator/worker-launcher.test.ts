import { describe, expect, it, vi } from "vitest";

import {
  canDispatchIssue,
  hasAvailableStateSlot,
  launchAvailableWorkers,
} from "../../src/orchestrator/worker-launcher.js";
import type { Issue, ServiceConfig } from "../../src/core/types.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";

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

function makeConfig(overrides: Partial<ServiceConfig["agent"]> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "MT",
      activeStates: ["In Progress", "Todo"],
      terminalStates: ["Done", "Canceled"],
    },
    agent: {
      maxConcurrentAgents: 3,
      maxConcurrentAgentsByState: {},
      maxTurns: 10,
      maxRetryBackoffMs: 300000,
      maxContinuationAttempts: 5,
      successState: null,
      stallTimeoutMs: 1200000,
      ...overrides,
    },
  } as unknown as ServiceConfig;
}

function makeEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    runId: "run-abc",
    issue: makeIssue(),
    workspace: { path: "/tmp/ws/MT-1", workspaceKey: "ws-key", createdNow: true },
    startedAtMs: Date.now() - 5000,
    lastEventAtMs: Date.now(),
    attempt: 1,
    abortController: new AbortController(),
    promise: Promise.resolve(),
    cleanupOnExit: false,
    status: "running",
    sessionId: "sess-xyz",
    tokenUsage: null,
    modelSelection: { model: "gpt-4o", reasoningEffort: "high", source: "default" },
    lastAgentMessageContent: null,
    repoMatch: null,
    queuePersistence: () => undefined,
    flushPersistence: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as RunningEntry;
}

// ---------------------------------------------------------------------------
// canDispatchIssue
// ---------------------------------------------------------------------------

describe("canDispatchIssue", () => {
  it("returns true for an active-state issue that is not claimed or blocked", () => {
    const config = makeConfig();
    const issue = makeIssue({ state: "In Progress" });
    expect(canDispatchIssue(issue, config, new Set())).toBe(true);
  });

  it("returns false when the issue state is not active", () => {
    const config = makeConfig();
    const issue = makeIssue({ state: "Backlog" });
    expect(canDispatchIssue(issue, config, new Set())).toBe(false);
  });

  it("returns false when the issue is already claimed", () => {
    const config = makeConfig();
    const issue = makeIssue({ state: "In Progress" });
    expect(canDispatchIssue(issue, config, new Set(["issue-1"]))).toBe(false);
  });

  it("returns false for a todo-state issue blocked by a non-terminal issue", () => {
    const config = makeConfig();
    const issue = makeIssue({
      state: "Todo",
      blockedBy: [{ id: "blk", identifier: "MT-0", state: "In Progress" }],
    });
    expect(canDispatchIssue(issue, config, new Set())).toBe(false);
  });

  it("returns true for a todo-state issue when all blockers are terminal", () => {
    const config = makeConfig();
    const issue = makeIssue({
      state: "Todo",
      blockedBy: [{ id: "blk", identifier: "MT-0", state: "Done" }],
    });
    expect(canDispatchIssue(issue, config, new Set())).toBe(true);
  });

  it("returns true for an active non-todo issue even with non-terminal blockers", () => {
    const config = makeConfig();
    const issue = makeIssue({
      state: "In Progress",
      blockedBy: [{ id: "blk", identifier: "MT-0", state: "In Progress" }],
    });
    // blocker check only applies to todo-state issues
    expect(canDispatchIssue(issue, config, new Set())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasAvailableStateSlot
// ---------------------------------------------------------------------------

describe("hasAvailableStateSlot", () => {
  it("returns true when no per-state limit is configured", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: {} });
    const issue = makeIssue({ state: "In Progress" });
    expect(hasAvailableStateSlot(issue, config, new Map())).toBe(true);
  });

  it("returns true when running count is below the configured limit", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 2 } });
    const issue = makeIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", makeEntry({ issue: makeIssue({ id: "other-1", state: "In Progress" }) }));

    expect(hasAvailableStateSlot(issue, config, runningEntries)).toBe(true);
  });

  it("returns false when running count reaches the configured limit", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 1 } });
    const issue = makeIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", makeEntry({ issue: makeIssue({ id: "other-1", state: "In Progress" }) }));

    expect(hasAvailableStateSlot(issue, config, runningEntries)).toBe(false);
  });

  it("accounts for pending state counts on top of running entries", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 2 } });
    const issue = makeIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", makeEntry({ issue: makeIssue({ id: "other-1", state: "In Progress" }) }));

    const pendingStateCounts = new Map([["in progress", 1]]);
    // 1 running + 1 pending = 2 >= limit of 2
    expect(hasAvailableStateSlot(issue, config, runningEntries, pendingStateCounts)).toBe(false);
  });

  it("allows dispatch when pending counts are absent", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 2 } });
    const issue = makeIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", makeEntry({ issue: makeIssue({ id: "other-1", state: "In Progress" }) }));

    // pendingStateCounts undefined, only 1 running < 2 limit
    expect(hasAvailableStateSlot(issue, config, runningEntries, undefined)).toBe(true);
  });

  it("normalizes state key for case-insensitive comparison", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 1 } });
    const issue = makeIssue({ state: "IN PROGRESS" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", makeEntry({ issue: makeIssue({ id: "other-1", state: "in progress" }) }));

    expect(hasAvailableStateSlot(issue, config, runningEntries)).toBe(false);
  });

  it("does not count entries in different states toward the limit", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 1 } });
    const issue = makeIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", makeEntry({ issue: makeIssue({ id: "other-1", state: "Todo" }) }));

    expect(hasAvailableStateSlot(issue, config, runningEntries)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// launchAvailableWorkers
// ---------------------------------------------------------------------------

describe("launchAvailableWorkers", () => {
  function makeLaunchCtx(
    overrides: {
      issues?: Issue[];
      maxConcurrentAgents?: number;
      runningCount?: number;
      canDispatch?: (issue: Issue) => boolean;
      hasSlot?: (issue: Issue) => boolean;
    } = {},
  ) {
    const {
      issues = [makeIssue()],
      maxConcurrentAgents = 3,
      runningCount = 0,
      canDispatch = () => true,
      hasSlot = () => true,
    } = overrides;

    const runningEntries = new Map<string, RunningEntry>();
    for (let idx = 0; idx < runningCount; idx++) {
      const entry = makeEntry({ issue: makeIssue({ id: `running-${idx}` }) });
      runningEntries.set(`running-${idx}`, entry);
    }

    const claimIssue = vi.fn();
    const launchWorker = vi.fn().mockResolvedValue(undefined);
    const fetchCandidateIssues = vi.fn().mockResolvedValue(issues);

    const ctx = {
      deps: { linearClient: { fetchCandidateIssues } },
      getConfig: () => makeConfig({ maxConcurrentAgents }),
      runningEntries,
      claimIssue,
      canDispatchIssue: canDispatch,
      hasAvailableStateSlot: hasSlot,
      launchWorker,
    };

    return { ctx, claimIssue, launchWorker, fetchCandidateIssues };
  }

  it("dispatches issues up to the available concurrency slots", async () => {
    const issues = [
      makeIssue({ id: "a", identifier: "MT-A", priority: 1 }),
      makeIssue({ id: "b", identifier: "MT-B", priority: 2 }),
      makeIssue({ id: "c", identifier: "MT-C", priority: 3 }),
    ];
    const { ctx, launchWorker, claimIssue } = makeLaunchCtx({
      issues,
      maxConcurrentAgents: 2,
      runningCount: 0,
    });

    await launchAvailableWorkers(ctx);

    expect(launchWorker).toHaveBeenCalledTimes(2);
    expect(claimIssue).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch when already at concurrency limit", async () => {
    const { ctx, launchWorker } = makeLaunchCtx({
      maxConcurrentAgents: 2,
      runningCount: 2,
    });

    await launchAvailableWorkers(ctx);

    expect(launchWorker).not.toHaveBeenCalled();
  });

  it("skips issues that fail canDispatchIssue", async () => {
    const issues = [makeIssue({ id: "skip", identifier: "MT-SKIP" }), makeIssue({ id: "ok", identifier: "MT-OK" })];
    const { ctx, launchWorker } = makeLaunchCtx({
      issues,
      canDispatch: (issue: Issue) => issue.id !== "skip",
    });

    await launchAvailableWorkers(ctx);

    expect(launchWorker).toHaveBeenCalledTimes(1);
    expect(launchWorker).toHaveBeenCalledWith(expect.objectContaining({ id: "ok" }), null, { claimHeld: true });
  });

  it("skips issues that fail hasAvailableStateSlot", async () => {
    const issues = [
      makeIssue({ id: "a", identifier: "MT-A", state: "In Progress" }),
      makeIssue({ id: "b", identifier: "MT-B", state: "In Progress" }),
    ];

    let callCount = 0;
    const { ctx, launchWorker } = makeLaunchCtx({
      issues,
      hasSlot: () => {
        callCount++;
        // Only the first issue gets a slot
        return callCount === 1;
      },
    });

    await launchAvailableWorkers(ctx);

    expect(launchWorker).toHaveBeenCalledTimes(1);
  });

  it("launches nothing when the candidate list is empty", async () => {
    const { ctx, launchWorker } = makeLaunchCtx({ issues: [] });

    await launchAvailableWorkers(ctx);

    expect(launchWorker).not.toHaveBeenCalled();
  });

  it("passes claimHeld: true to each launched worker", async () => {
    const issues = [makeIssue({ id: "a", identifier: "MT-A" })];
    const { ctx, launchWorker } = makeLaunchCtx({ issues });

    await launchAvailableWorkers(ctx);

    expect(launchWorker).toHaveBeenCalledWith(expect.any(Object), null, { claimHeld: true });
  });

  it("claims each issue before launching it", async () => {
    const issues = [makeIssue({ id: "a", identifier: "MT-A" })];
    const { ctx, claimIssue, launchWorker } = makeLaunchCtx({ issues });

    const callOrder: string[] = [];
    claimIssue.mockImplementation(() => callOrder.push("claim"));
    launchWorker.mockImplementation(async () => callOrder.push("launch"));

    await launchAvailableWorkers(ctx);

    expect(callOrder).toEqual(["claim", "launch"]);
  });
});
