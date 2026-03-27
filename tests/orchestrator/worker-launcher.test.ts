import { describe, expect, it, vi } from "vitest";

import {
  canDispatchIssue,
  hasAvailableStateSlot,
  launchAvailableWorkers,
} from "../../src/orchestrator/worker-launcher.js";
import type { Issue, ServiceConfig } from "../../src/core/types.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";
import { createIssue, createRunningEntry } from "./issue-test-factories.js";

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

// ---------------------------------------------------------------------------
// canDispatchIssue
// ---------------------------------------------------------------------------

describe("canDispatchIssue", () => {
  it("returns true for an active-state issue that is not claimed or blocked", () => {
    const config = makeConfig();
    const issue = createIssue({ state: "In Progress" });
    expect(canDispatchIssue(issue, config, new Set())).toBe(true);
  });

  it("returns false when the issue state is not active", () => {
    const config = makeConfig();
    const issue = createIssue({ state: "Backlog" });
    expect(canDispatchIssue(issue, config, new Set())).toBe(false);
  });

  it("returns false when the issue is already claimed", () => {
    const config = makeConfig();
    const issue = createIssue({ state: "In Progress" });
    expect(canDispatchIssue(issue, config, new Set(["issue-1"]))).toBe(false);
  });

  it("returns false for a todo-state issue blocked by a non-terminal issue", () => {
    const config = makeConfig();
    const issue = createIssue({
      state: "Todo",
      blockedBy: [{ id: "blk", identifier: "MT-0", state: "In Progress" }],
    });
    expect(canDispatchIssue(issue, config, new Set())).toBe(false);
  });

  it("returns true for a todo-state issue when all blockers are terminal", () => {
    const config = makeConfig();
    const issue = createIssue({
      state: "Todo",
      blockedBy: [{ id: "blk", identifier: "MT-0", state: "Done" }],
    });
    expect(canDispatchIssue(issue, config, new Set())).toBe(true);
  });

  it("returns true for an active non-todo issue even with non-terminal blockers", () => {
    const config = makeConfig();
    const issue = createIssue({
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
    const issue = createIssue({ state: "In Progress" });
    expect(hasAvailableStateSlot(issue, config, new Map())).toBe(true);
  });

  it("returns true when running count is below the configured limit", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 2 } });
    const issue = createIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", createRunningEntry({ issue: createIssue({ id: "other-1", state: "In Progress" }) }));

    expect(hasAvailableStateSlot(issue, config, runningEntries)).toBe(true);
  });

  it("returns false when running count reaches the configured limit", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 1 } });
    const issue = createIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", createRunningEntry({ issue: createIssue({ id: "other-1", state: "In Progress" }) }));

    expect(hasAvailableStateSlot(issue, config, runningEntries)).toBe(false);
  });

  it("accounts for pending state counts on top of running entries", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 2 } });
    const issue = createIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", createRunningEntry({ issue: createIssue({ id: "other-1", state: "In Progress" }) }));

    const pendingStateCounts = new Map([["in progress", 1]]);
    // 1 running + 1 pending = 2 >= limit of 2
    expect(hasAvailableStateSlot(issue, config, runningEntries, pendingStateCounts)).toBe(false);
  });

  it("allows dispatch when pending counts are absent", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 2 } });
    const issue = createIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", createRunningEntry({ issue: createIssue({ id: "other-1", state: "In Progress" }) }));

    // pendingStateCounts undefined, only 1 running < 2 limit
    expect(hasAvailableStateSlot(issue, config, runningEntries, undefined)).toBe(true);
  });

  it("normalizes state key for case-insensitive comparison", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 1 } });
    const issue = createIssue({ state: "IN PROGRESS" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", createRunningEntry({ issue: createIssue({ id: "other-1", state: "in progress" }) }));

    expect(hasAvailableStateSlot(issue, config, runningEntries)).toBe(false);
  });

  it("does not count entries in different states toward the limit", () => {
    const config = makeConfig({ maxConcurrentAgentsByState: { "in progress": 1 } });
    const issue = createIssue({ state: "In Progress" });

    const runningEntries = new Map<string, RunningEntry>();
    runningEntries.set("other-1", createRunningEntry({ issue: createIssue({ id: "other-1", state: "Todo" }) }));

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
      issues = [createIssue()],
      maxConcurrentAgents = 3,
      runningCount = 0,
      canDispatch = () => true,
      hasSlot = () => true,
    } = overrides;

    const runningEntries = new Map<string, RunningEntry>();
    for (let idx = 0; idx < runningCount; idx++) {
      const entry = createRunningEntry({ issue: createIssue({ id: `running-${idx}` }) });
      runningEntries.set(`running-${idx}`, entry);
    }

    const claimIssue = vi.fn();
    const launchWorker = vi.fn().mockResolvedValue(undefined);
    const fetchCandidateIssues = vi.fn().mockResolvedValue(issues);

    const ctx = {
      deps: { tracker: { fetchCandidateIssues } },
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
      createIssue({ id: "a", identifier: "MT-A", priority: 1 }),
      createIssue({ id: "b", identifier: "MT-B", priority: 2 }),
      createIssue({ id: "c", identifier: "MT-C", priority: 3 }),
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
    const issues = [createIssue({ id: "skip", identifier: "MT-SKIP" }), createIssue({ id: "ok", identifier: "MT-OK" })];
    const { ctx, launchWorker } = makeLaunchCtx({
      issues,
      canDispatch: (issue: Issue) => issue.id !== "skip",
    });

    await launchAvailableWorkers(ctx);

    expect(launchWorker).toHaveBeenCalledTimes(1);
    expect(launchWorker).toHaveBeenCalledWith(expect.objectContaining({ id: "ok" }), 1, { claimHeld: true });
  });

  it("skips issues that fail hasAvailableStateSlot", async () => {
    const issues = [
      createIssue({ id: "a", identifier: "MT-A", state: "In Progress" }),
      createIssue({ id: "b", identifier: "MT-B", state: "In Progress" }),
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
    const issues = [createIssue({ id: "a", identifier: "MT-A" })];
    const { ctx, launchWorker } = makeLaunchCtx({ issues });

    await launchAvailableWorkers(ctx);

    expect(launchWorker).toHaveBeenCalledWith(expect.any(Object), 1, { claimHeld: true });
  });

  it("claims each issue before launching it", async () => {
    const issues = [createIssue({ id: "a", identifier: "MT-A" })];
    const { ctx, claimIssue, launchWorker } = makeLaunchCtx({ issues });

    const callOrder: string[] = [];
    claimIssue.mockImplementation(() => callOrder.push("claim"));
    launchWorker.mockImplementation(async () => callOrder.push("launch"));

    await launchAvailableWorkers(ctx);

    expect(callOrder).toEqual(["claim", "launch"]);
  });
});
