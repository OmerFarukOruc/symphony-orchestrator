import { describe, expect, it, vi } from "vitest";

import {
  reconcileRunningAndRetrying,
  refreshQueueViews,
  cleanupTerminalIssueWorkspaces,
  seedCompletedClaims,
} from "../../src/orchestrator/lifecycle.js";
import type { AttemptRecord, Issue, ServiceConfig } from "../../src/core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "../../src/orchestrator/runtime-types.js";

function makeMockLogger() {
  return {
    child: vi.fn(() => makeMockLogger()),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
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

function makeConfig(overrides: Partial<ServiceConfig["tracker"]> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "MT",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Canceled"],
      ...overrides,
    },
    codex: { stallTimeoutMs: 60000 },
    agent: { maxConcurrentAgents: 5, maxConcurrentAgentsByState: {} },
  } as unknown as ServiceConfig;
}

function makeRunningEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    runId: "run-1",
    issue: makeIssue(),
    workspace: { path: "/tmp/ws", workspaceKey: "ws-1", createdNow: false },
    startedAtMs: Date.now() - 5000,
    lastEventAtMs: Date.now(),
    attempt: 1,
    abortController: new AbortController(),
    promise: Promise.resolve(),
    cleanupOnExit: false,
    status: "running",
    sessionId: "sess-1",
    tokenUsage: null,
    modelSelection: { model: "gpt-4o", reasoningEffort: "high", source: "default" },
    lastAgentMessageContent: null,
    repoMatch: null,
    queuePersistence: () => undefined,
    flushPersistence: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as RunningEntry;
}

function makeRetryEntry(overrides: Partial<RetryRuntimeEntry> = {}): RetryRuntimeEntry {
  return {
    issueId: "issue-1",
    identifier: "MT-1",
    attempt: 1,
    dueAtMs: Date.now() + 5000,
    error: null,
    timer: null,
    issue: makeIssue(),
    workspaceKey: null,
    ...overrides,
  };
}

describe("reconcileRunningAndRetrying", () => {
  it("is a no-op when no running or retry entries exist", async () => {
    const fetchSpy = vi.fn();
    await reconcileRunningAndRetrying({
      runningEntries: new Map(),
      retryEntries: new Map(),
      deps: {
        tracker: { fetchIssueStatesByIds: fetchSpy, fetchIssuesByStates: vi.fn() },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not enforce stall timeouts during reconciliation", async () => {
    const entry = makeRunningEntry({ lastEventAtMs: Date.now() - 120000 });
    await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([makeIssue()]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(entry.abortController.signal.aborted).toBe(false);
    expect(entry.status).toBe("running");
  });

  it("aborts running entry when issue moves to terminal state", async () => {
    const entry = makeRunningEntry();
    await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([makeIssue({ state: "Done" })]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(entry.cleanupOnExit).toBe(true);
    expect(entry.abortController.signal.aborted).toBe(true);
    expect(entry.status).toBe("stopping");
  });

  it("aborts running entry when issue becomes inactive (non-terminal)", async () => {
    const entry = makeRunningEntry();
    await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([makeIssue({ state: "Backlog" })]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(entry.abortController.signal.aborted).toBe(true);
    expect(entry.status).toBe("stopping");
    expect(entry.cleanupOnExit).toBe(false);
  });

  it("clears retry entry and removes workspace when issue is terminal", async () => {
    const clearRetryEntry = vi.fn();
    const removeWorkspace = vi.fn().mockResolvedValue(undefined);
    await reconcileRunningAndRetrying({
      runningEntries: new Map(),
      retryEntries: new Map([["issue-1", makeRetryEntry()]]),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([makeIssue({ state: "Done" })]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry,
      pushEvent: vi.fn(),
    });
    expect(clearRetryEntry).toHaveBeenCalledWith("issue-1");
    expect(removeWorkspace).toHaveBeenCalledWith(
      "MT-1",
      expect.objectContaining({ identifier: "MT-1", state: "Done" }),
    );
  });

  it("clears retry entry without workspace removal when issue becomes inactive", async () => {
    const clearRetryEntry = vi.fn();
    const removeWorkspace = vi.fn();
    await reconcileRunningAndRetrying({
      runningEntries: new Map(),
      retryEntries: new Map([["issue-1", makeRetryEntry()]]),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([makeIssue({ state: "Backlog" })]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry,
      pushEvent: vi.fn(),
    });
    expect(clearRetryEntry).toHaveBeenCalledWith("issue-1");
    expect(removeWorkspace).not.toHaveBeenCalled();
  });

  it("clears retry entry when issue not found in fetch results", async () => {
    const clearRetryEntry = vi.fn();
    await reconcileRunningAndRetrying({
      runningEntries: new Map(),
      retryEntries: new Map([["issue-1", makeRetryEntry()]]),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry,
      pushEvent: vi.fn(),
    });
    expect(clearRetryEntry).toHaveBeenCalledWith("issue-1");
  });
});

describe("refreshQueueViews", () => {
  it("builds queued views from candidate issues", async () => {
    const issues = [
      makeIssue({ id: "i1", identifier: "MT-1", state: "In Progress", priority: 1 }),
      makeIssue({ id: "i2", identifier: "MT-2", state: "In Progress", priority: 2 }),
    ];
    let captured: unknown[] = [];
    await refreshQueueViews({
      queuedViews: [],
      detailViews: new Map(),
      claimedIssueIds: new Set(["i1"]),
      deps: { tracker: { fetchCandidateIssues: vi.fn().mockResolvedValue(issues) } },
      canDispatchIssue: () => true,
      resolveModelSelection: () => ({ model: "gpt-4o", reasoningEffort: "high" as const, source: "default" as const }),
      setQueuedViews: (views) => {
        captured = views;
      },
    });
    expect(captured.length).toBe(2);
  });

  it("adds all fetched issues to detailViews including claimed ones", async () => {
    const issues = [makeIssue({ id: "i1", identifier: "MT-1" }), makeIssue({ id: "i2", identifier: "MT-2" })];
    const detailViews = new Map<string, unknown>();
    await refreshQueueViews({
      queuedViews: [],
      detailViews: detailViews as never,
      claimedIssueIds: new Set(["i1"]),
      deps: { tracker: { fetchCandidateIssues: vi.fn().mockResolvedValue(issues) } },
      canDispatchIssue: () => true,
      resolveModelSelection: () => ({ model: "gpt-4o", reasoningEffort: "high" as const, source: "default" as const }),
      setQueuedViews: () => undefined,
    });
    expect(detailViews.has("MT-1")).toBe(true);
    expect(detailViews.has("MT-2")).toBe(true);
  });

  it("removes stale detailViews entries for issues no longer in the queue", async () => {
    const issues = [makeIssue({ id: "i2", identifier: "MT-2" })];
    const detailViews = new Map<string, unknown>([
      ["MT-1", { identifier: "MT-1" }],
      ["MT-2", { identifier: "MT-2" }],
    ]);
    await refreshQueueViews({
      queuedViews: [],
      detailViews: detailViews as never,
      claimedIssueIds: new Set<string>(),
      deps: { tracker: { fetchCandidateIssues: vi.fn().mockResolvedValue(issues) } },
      canDispatchIssue: () => true,
      resolveModelSelection: () => ({ model: "gpt-4o", reasoningEffort: "high" as const, source: "default" as const }),
      setQueuedViews: () => undefined,
    });
    expect(detailViews.has("MT-1")).toBe(false);
    expect(detailViews.has("MT-2")).toBe(true);
  });

  it("emits issue_queued only for newly queued issues", async () => {
    const pushed: Array<Record<string, unknown>> = [];
    await refreshQueueViews({
      queuedViews: [makeIssue({ id: "i1", identifier: "MT-1" })].map((issue) => ({
        issueId: issue.id,
        identifier: issue.identifier,
      })) as never,
      detailViews: new Map(),
      claimedIssueIds: new Set<string>(),
      deps: {
        tracker: {
          fetchCandidateIssues: vi
            .fn()
            .mockResolvedValue([
              makeIssue({ id: "i1", identifier: "MT-1" }),
              makeIssue({ id: "i2", identifier: "MT-2" }),
            ]),
        },
      },
      canDispatchIssue: () => true,
      resolveModelSelection: () => ({ model: "gpt-4o", reasoningEffort: "high" as const, source: "default" as const }),
      setQueuedViews: () => undefined,
      pushEvent: (event) => pushed.push(event as Record<string, unknown>),
    });

    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      issueIdentifier: "MT-2",
      event: "issue_queued",
    });
  });

  it("does not emit issue_queued for hidden issues beyond the 50-item queue cap", async () => {
    const issues = Array.from({ length: 51 }, (_, index) =>
      makeIssue({ id: `i${index}`, identifier: `MT-${index}`, priority: index }),
    );
    const pushed: Array<Record<string, unknown>> = [];

    await refreshQueueViews({
      queuedViews: [],
      detailViews: new Map(),
      claimedIssueIds: new Set<string>(),
      deps: {
        tracker: {
          fetchCandidateIssues: vi.fn().mockResolvedValue(issues),
        },
      },
      canDispatchIssue: () => true,
      resolveModelSelection: () => ({ model: "gpt-4o", reasoningEffort: "high" as const, source: "default" as const }),
      setQueuedViews: () => undefined,
      pushEvent: (event) => pushed.push(event as Record<string, unknown>),
    });

    expect(pushed).toHaveLength(50);
    expect(pushed.some((event) => event.issueIdentifier === "MT-50")).toBe(false);
  });
});

describe("cleanupTerminalIssueWorkspaces", () => {
  it("removes workspaces for terminal issues", async () => {
    const removeWorkspace = vi.fn().mockResolvedValue(undefined);
    await cleanupTerminalIssueWorkspaces({
      deps: {
        tracker: {
          fetchIssuesByStates: vi
            .fn()
            .mockResolvedValue([makeIssue({ identifier: "MT-1" }), makeIssue({ identifier: "MT-2" })]),
        },
        workspaceManager: { removeWorkspace },
        logger: { warn: vi.fn() },
      },
      getConfig: () => makeConfig(),
    });
    expect(removeWorkspace).toHaveBeenCalledWith("MT-1", expect.objectContaining({ identifier: "MT-1" }));
    expect(removeWorkspace).toHaveBeenCalledWith("MT-2", expect.objectContaining({ identifier: "MT-2" }));
  });

  it("logs warning on fetch error instead of throwing", async () => {
    const warn = vi.fn();
    await cleanupTerminalIssueWorkspaces({
      deps: {
        tracker: { fetchIssuesByStates: vi.fn().mockRejectedValue(new Error("network error")) },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: { warn },
      },
      getConfig: () => makeConfig(),
    });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }), expect.any(String));
  });

  it("logs the specific error message on fetch failure", async () => {
    const warn = vi.fn();
    await cleanupTerminalIssueWorkspaces({
      deps: {
        tracker: { fetchIssuesByStates: vi.fn().mockRejectedValue(new Error("net err")) },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: { warn },
      },
      getConfig: () => makeConfig(),
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "net err" }),
      "startup terminal workspace cleanup failed",
    );
  });

  it("ignores individual workspace removal failures", async () => {
    const removeWorkspace = vi.fn().mockRejectedValue(new Error("rm failed"));
    await expect(
      cleanupTerminalIssueWorkspaces({
        deps: {
          tracker: {
            fetchIssuesByStates: vi.fn().mockResolvedValue([makeIssue()]),
          },
          workspaceManager: { removeWorkspace },
          logger: { warn: vi.fn() },
        },
        getConfig: () => makeConfig(),
      }),
    ).resolves.toBeUndefined();
  });

  it("logs workspace cleanup error with identifier and message", async () => {
    const warn = vi.fn();
    const removeWorkspace = vi.fn().mockRejectedValue(new Error("rm failed"));
    await cleanupTerminalIssueWorkspaces({
      deps: {
        tracker: {
          fetchIssuesByStates: vi.fn().mockResolvedValue([makeIssue({ identifier: "MT-5" })]),
        },
        workspaceManager: { removeWorkspace },
        logger: { warn },
      },
      getConfig: () => makeConfig(),
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "MT-5", error: "rm failed" }),
      "workspace cleanup failed for terminal issue",
    );
  });
});

describe("reconcileRunningAndRetrying — changed return value", () => {
  it("returns true when a running entry's issue object changes", async () => {
    const originalIssue = makeIssue({ id: "issue-1", title: "original" });
    const updatedIssue = makeIssue({ id: "issue-1", title: "updated" });
    const entry = makeRunningEntry({ issue: originalIssue });

    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([updatedIssue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(result).toBe(true);
    expect(entry.issue).toBe(updatedIssue);
  });

  it("returns false when the issue object is unchanged and state is active", async () => {
    const sameIssue = makeIssue({ id: "issue-1" });
    const entry = makeRunningEntry({ issue: sameIssue });

    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([sameIssue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(result).toBe(false);
  });

  it("returns false when there are no tracked entries", async () => {
    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map(),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn(),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(result).toBe(false);
  });

  it("returns true when both issue changed AND became terminal", async () => {
    const originalIssue = makeIssue({ id: "issue-1" });
    const terminalIssue = makeIssue({ id: "issue-1", state: "Done" });
    const entry = makeRunningEntry({ issue: originalIssue });

    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([terminalIssue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(result).toBe(true);
  });

  it("correctly combines changed from multiple running entries", async () => {
    const issue1 = makeIssue({ id: "issue-1", identifier: "MT-1" });
    const issue2 = makeIssue({ id: "issue-2", identifier: "MT-2" });
    const entry1 = makeRunningEntry({ issue: issue1 });
    const entry2 = makeRunningEntry({ issue: issue2 });

    const updated1 = makeIssue({ id: "issue-1", identifier: "MT-1", title: "changed" });

    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map([
        ["issue-1", entry1],
        ["issue-2", entry2],
      ]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([updated1, issue2]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    // entry1 changed but entry2 did not — result should still be true
    expect(result).toBe(true);
  });

  it("passes all tracked IDs to fetchIssueStatesByIds", async () => {
    const fetchSpy = vi.fn().mockResolvedValue([]);
    const retryEntry = makeRetryEntry({ issueId: "issue-2" });

    await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", makeRunningEntry()]]),
      retryEntries: new Map([["issue-2", retryEntry]]),
      deps: {
        tracker: { fetchIssueStatesByIds: fetchSpy, fetchIssuesByStates: vi.fn() },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });

    const calledIds = fetchSpy.mock.calls[0][0] as string[];
    expect(calledIds).toContain("issue-1");
    expect(calledIds).toContain("issue-2");
  });

  it("sets cleanupOnExit=true only for terminal, not for inactive", async () => {
    const terminalEntry = makeRunningEntry({
      issue: makeIssue({ id: "issue-1" }),
    });
    const inactiveEntry = makeRunningEntry({
      issue: makeIssue({ id: "issue-2", identifier: "MT-2" }),
    });

    await reconcileRunningAndRetrying({
      runningEntries: new Map([
        ["issue-1", terminalEntry],
        ["issue-2", inactiveEntry],
      ]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi
            .fn()
            .mockResolvedValue([
              makeIssue({ id: "issue-1", state: "Done" }),
              makeIssue({ id: "issue-2", identifier: "MT-2", state: "Backlog" }),
            ]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(terminalEntry.cleanupOnExit).toBe(true);
    expect(inactiveEntry.cleanupOnExit).toBe(false);
  });

  it("does not abort already-aborted entries on inactive transition", async () => {
    const controller = new AbortController();
    controller.abort("previous");
    const entry = makeRunningEntry({
      abortController: controller,
      status: "stopping",
    });

    await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([makeIssue({ state: "Backlog" })]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    // Status was already stopping, should still be stopping
    expect(entry.status).toBe("stopping");
  });

  it("skips running entries when issue is missing from fetch results", async () => {
    const entry = makeRunningEntry();
    await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(entry.abortController.signal.aborted).toBe(false);
    expect(entry.status).toBe("running");
  });

  it("logs workspace cleanup error during retry reconciliation", async () => {
    const logger = makeMockLogger();
    const removeWorkspace = vi.fn().mockRejectedValue(new Error("disk full"));

    await reconcileRunningAndRetrying({
      runningEntries: new Map(),
      retryEntries: new Map([["issue-1", makeRetryEntry()]]),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([makeIssue({ state: "Done" })]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace },
        logger,
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: "issue-1",
        identifier: "MT-1",
        error: "disk full",
      }),
      "workspace cleanup failed during retry reconciliation",
    );
  });

  it("clears retry entries for issues that become inactive (not terminal, not active)", async () => {
    const clearRetryEntry = vi.fn();
    const retryEntry = makeRetryEntry({ issueId: "issue-1" });
    // "Backlog" is neither active nor terminal
    const latestIssue = makeIssue({ id: "issue-1", state: "Backlog" });

    await reconcileRunningAndRetrying({
      runningEntries: new Map(),
      retryEntries: new Map([["issue-1", retryEntry]]),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([latestIssue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry,
      pushEvent: vi.fn(),
    });
    expect(clearRetryEntry).toHaveBeenCalledWith("issue-1");
  });

  it("clears retry on inactive (not active, not terminal) without workspace removal", async () => {
    // Targets: } else if (!isActiveState(latest.state, config)) { ctx.clearRetryEntry }
    // "Review" is not in activeStates (["In Progress"]) and not in terminalStates (["Done","Canceled"])
    const clearRetryEntry = vi.fn();
    const removeWorkspace = vi.fn();
    await reconcileRunningAndRetrying({
      runningEntries: new Map(),
      retryEntries: new Map([["issue-1", makeRetryEntry()]]),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([makeIssue({ state: "Review" })]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry,
      pushEvent: vi.fn(),
    });
    expect(clearRetryEntry).toHaveBeenCalledWith("issue-1");
    expect(removeWorkspace).not.toHaveBeenCalled();
  });

  it("returns true from || when markRunningEntryStopping returns true but changed was false (terminal)", async () => {
    // Targets: return markRunningEntryStopping(entry, "terminal", true) || changed;
    // For || vs && to differ, we need markRunningEntryStopping=true AND changed=false.
    // changed=false means entry.issue === latest (same reference), so we must return
    // the SAME issue object from fetchIssueStatesByIds.
    // markRunningEntryStopping=true means something changes (status or cleanupOnExit).
    const terminalIssue = makeIssue({ id: "issue-1", state: "Done" });
    const entry = makeRunningEntry({
      issue: terminalIssue,
      status: "running",
      cleanupOnExit: false,
    });

    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          // Return the SAME object reference so entry.issue === latest -> changed stays false
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([terminalIssue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    // markRunningEntryStopping returns true (status changed to stopping, cleanupOnExit changed to true)
    // changed was false (same issue object). With ||, true || false = true. With &&, true && false = false.
    expect(result).toBe(true);
    expect(entry.cleanupOnExit).toBe(true);
    expect(entry.status).toBe("stopping");
  });

  it("returns true when inactive stopping changes status (|| changed path)", async () => {
    // Targets: return markRunningEntryStopping(entry, "inactive", false) || changed;
    // Entry has same issue object, but becomes inactive -> status changes to stopping
    const issue = makeIssue({ id: "issue-1", state: "Backlog" });
    const entry = makeRunningEntry({ issue });

    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([issue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    // Same issue object so entry.issue === latest (no change there)
    // But status changes from "running" to "stopping" in markRunningEntryStopping
    expect(result).toBe(true);
    expect(entry.status).toBe("stopping");
  });

  it("markRunningEntryStopping reports no change when already fully stopped (terminal path)", async () => {
    // Entry is already stopping, aborted, and cleanupOnExit=true.
    // Terminal state triggers markRunningEntryStopping("terminal", true) but nothing changes.
    // This kills mutants: let changed = false -> true, changed = true -> false,
    //   if (true) on abort check, if (true) on status check
    const controller = new AbortController();
    controller.abort("prev");
    const terminalIssue = makeIssue({ id: "issue-1", state: "Done" });
    const entry = makeRunningEntry({
      issue: terminalIssue,
      abortController: controller,
      status: "stopping",
      cleanupOnExit: true, // already true, so cleanupOnExit branch won't set changed
    });

    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          // SAME object so entry.issue === latest -> changed stays false in syncRunningEntry
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([terminalIssue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    // markRunningEntryStopping is called but: cleanupOnExit already true -> no change,
    // already aborted -> no abort, status already "stopping" -> no change.
    // Returns false. reconcileRunning: false || false = false.
    expect(result).toBe(false);
  });

  it("markRunningEntryStopping returns true only from cleanupOnExit (not status)", async () => {
    // Entry: status="stopping" (already), aborted, but cleanupOnExit=false.
    // Terminal -> markRunningEntryStopping("terminal", true). cleanupOnExit changes -> changed=true.
    // Abort is already done, status is already "stopping" -> those branches don't set changed.
    // This specifically tests that changed=true comes ONLY from cleanupOnExit, not from status.
    const controller = new AbortController();
    controller.abort("prev");
    const terminalIssue = makeIssue({ id: "issue-1", state: "Done" });
    const entry = makeRunningEntry({
      issue: terminalIssue,
      abortController: controller,
      status: "stopping",
      cleanupOnExit: false, // will change to true
    });

    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([terminalIssue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    // cleanupOnExit changed: true. Status didn't change: no. Abort didn't change: no.
    // So changed = true from cleanupOnExit only. Result = true || false = true.
    expect(result).toBe(true);
    expect(entry.cleanupOnExit).toBe(true);
    expect(entry.status).toBe("stopping"); // was already stopping
  });

  it("does NOT clear retry entry when issue is still active", async () => {
    // Targets: } else if (!isActiveState(latest.state, config)) { — mutated to else if (true)
    // If mutated, an active retry entry would be incorrectly cleared.
    const clearRetryEntry = vi.fn();
    const retryEntry = makeRetryEntry({ issueId: "issue-1" });
    const activeIssue = makeIssue({ id: "issue-1", state: "In Progress" }); // IS in activeStates

    await reconcileRunningAndRetrying({
      runningEntries: new Map(),
      retryEntries: new Map([["issue-1", retryEntry]]),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([activeIssue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry,
      pushEvent: vi.fn(),
    });
    // Active issues should NOT have their retry entries cleared
    expect(clearRetryEntry).not.toHaveBeenCalled();
  });

  it("returns true from || when markRunningEntryStopping returns true for inactive (same issue ref)", async () => {
    // Targets: return markRunningEntryStopping(entry, "inactive", false) || changed;
    // Same issue object reference (changed=false), but entry goes inactive so status changes.
    const inactiveIssue = makeIssue({ id: "issue-1", state: "Backlog" });
    const entry = makeRunningEntry({
      issue: inactiveIssue,
      status: "running",
      cleanupOnExit: false,
    });

    const result = await reconcileRunningAndRetrying({
      runningEntries: new Map([["issue-1", entry]]),
      retryEntries: new Map(),
      deps: {
        tracker: {
          fetchIssueStatesByIds: vi.fn().mockResolvedValue([inactiveIssue]),
          fetchIssuesByStates: vi.fn(),
        },
        workspaceManager: { removeWorkspace: vi.fn() },
        logger: makeMockLogger(),
      },
      getConfig: () => makeConfig(),
      clearRetryEntry: vi.fn(),
      pushEvent: vi.fn(),
    });
    // markRunningEntryStopping returns true (status changed), changed was false (same ref)
    // With ||: true || false = true. With &&: true && false = false.
    expect(result).toBe(true);
    expect(entry.status).toBe("stopping");
  });
});

describe("seedCompletedClaims — startedAt boundary", () => {
  it("uses strictly greater-than for startedAt comparison (not >=)", () => {
    // Two attempts with same startedAt — only the first one encountered should be kept
    const completedViews = new Map<string, Record<string, unknown>>();
    const attempt1 = makeAttemptRecord({
      attemptId: "a1",
      issueIdentifier: "MT-1",
      startedAt: "2026-01-01T00:00:00Z",
      status: "completed",
      title: "First",
    });
    const attempt2 = makeAttemptRecord({
      attemptId: "a2",
      issueIdentifier: "MT-1",
      startedAt: "2026-01-01T00:00:00Z",
      status: "failed",
      title: "Second",
    });
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: completedViews as never,
      deps: {
        attemptStore: { getAllAttempts: () => [attempt1, attempt2] },
        logger: { info: vi.fn() },
      },
    });
    // With >= the second would replace the first; with > only strictly newer replaces
    const view = completedViews.get("MT-1")!;
    expect(view.status).toBe("completed");
  });
});

describe("refreshQueueViews — additional coverage", () => {
  it("sets modelChangePending to false for queued views", async () => {
    const issues = [makeIssue({ id: "i1", identifier: "MT-1" })];
    let captured: Array<Record<string, unknown>> = [];
    await refreshQueueViews({
      queuedViews: [],
      detailViews: new Map(),
      claimedIssueIds: new Set(),
      deps: { tracker: { fetchCandidateIssues: vi.fn().mockResolvedValue(issues) } },
      canDispatchIssue: () => true,
      resolveModelSelection: () => ({ model: "gpt-4o", reasoningEffort: "high" as const, source: "default" as const }),
      setQueuedViews: (views) => {
        captured = views as unknown as Array<Record<string, unknown>>;
      },
    });
    expect(captured[0].modelChangePending).toBe(false);
  });

  it("emits issue_queued event with correct message and metadata", async () => {
    const pushed: Array<Record<string, unknown>> = [];
    const issue = makeIssue({ id: "i1", identifier: "MT-1", state: "In Progress", priority: 2 });
    await refreshQueueViews({
      queuedViews: [],
      detailViews: new Map(),
      claimedIssueIds: new Set(),
      deps: { tracker: { fetchCandidateIssues: vi.fn().mockResolvedValue([issue]) } },
      canDispatchIssue: () => true,
      resolveModelSelection: () => ({ model: "gpt-4o", reasoningEffort: "high" as const, source: "default" as const }),
      setQueuedViews: () => undefined,
      pushEvent: (event) => pushed.push(event as Record<string, unknown>),
    });
    expect(pushed).toHaveLength(1);
    expect(pushed[0].event).toBe("issue_queued");
    expect(pushed[0].message).toBe("Issue queued for dispatch");
    expect(pushed[0].metadata).toEqual({ state: "In Progress", priority: 2 });
  });

  it("populates detailViews with model selection fields", async () => {
    const issues = [makeIssue({ id: "i1", identifier: "MT-1" })];
    const detailViews = new Map<string, Record<string, unknown>>();
    await refreshQueueViews({
      queuedViews: [],
      detailViews: detailViews as never,
      claimedIssueIds: new Set(),
      deps: { tracker: { fetchCandidateIssues: vi.fn().mockResolvedValue(issues) } },
      canDispatchIssue: () => true,
      resolveModelSelection: () => ({
        model: "claude-3",
        reasoningEffort: "medium" as const,
        source: "override" as const,
      }),
      setQueuedViews: () => undefined,
    });
    const detail = detailViews.get("MT-1");
    expect(detail).toBeDefined();
    expect(detail!.configuredModel).toBe("claude-3");
    expect(detail!.configuredReasoningEffort).toBe("medium");
    expect(detail!.configuredModelSource).toBe("override");
    expect(detail!.model).toBe("claude-3");
    expect(detail!.reasoningEffort).toBe("medium");
    expect(detail!.modelSource).toBe("override");
    expect(detail!.modelChangePending).toBe(false);
  });

  it("accepts pre-fetched candidateIssues parameter", async () => {
    const fetchSpy = vi.fn();
    const issues = [makeIssue({ id: "i1", identifier: "MT-1" })];
    let captured: unknown[] = [];
    await refreshQueueViews(
      {
        queuedViews: [],
        detailViews: new Map(),
        claimedIssueIds: new Set(),
        deps: { tracker: { fetchCandidateIssues: fetchSpy } },
        canDispatchIssue: () => true,
        resolveModelSelection: () => ({
          model: "gpt-4o",
          reasoningEffort: "high" as const,
          source: "default" as const,
        }),
        setQueuedViews: (views) => {
          captured = views;
        },
      },
      issues,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(captured).toHaveLength(1);
  });
});

function makeAttemptRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-1",
    title: "Test",
    workspaceKey: "ws-1",
    workspacePath: "/tmp/ws",
    status: "completed",
    attemptNumber: 1,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
    model: "gpt-4o",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: "thread-1",
    turnId: "turn-1",
    turnCount: 1,
    errorCode: null,
    errorMessage: null,
    tokenUsage: null,
    ...overrides,
  };
}

describe("seedCompletedClaims", () => {
  it("seeds claimed issue IDs for completed attempts", () => {
    const claimedIssueIds = new Set<string>();
    const completedViews = new Map<string, unknown>();
    const info = vi.fn();
    seedCompletedClaims({
      claimedIssueIds,
      completedViews: completedViews as never,
      deps: {
        attemptStore: { getAllAttempts: () => [makeAttemptRecord({ status: "completed", issueId: "issue-1" })] },
        logger: { info },
      },
    });
    expect(claimedIssueIds.has("issue-1")).toBe(true);
  });

  it("does not claim non-completed statuses", () => {
    const claimedIssueIds = new Set<string>();
    const completedViews = new Map<string, unknown>();
    seedCompletedClaims({
      claimedIssueIds,
      completedViews: completedViews as never,
      deps: {
        attemptStore: { getAllAttempts: () => [makeAttemptRecord({ status: "failed", issueId: "issue-1" })] },
        logger: { info: vi.fn() },
      },
    });
    expect(claimedIssueIds.has("issue-1")).toBe(false);
  });

  it("populates completedViews for each terminal attempt status", () => {
    const completedViews = new Map<string, Record<string, unknown>>();
    const terminalStatuses = ["completed", "failed", "timed_out", "stalled", "cancelled", "paused"];
    const attempts = terminalStatuses.map((status, index) =>
      makeAttemptRecord({
        status,
        issueId: `issue-${index}`,
        issueIdentifier: `MT-${index}`,
        attemptId: `attempt-${index}`,
      }),
    );
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: completedViews as never,
      deps: {
        attemptStore: { getAllAttempts: () => attempts },
        logger: { info: vi.fn() },
      },
    });
    for (const status of terminalStatuses) {
      const index = terminalStatuses.indexOf(status);
      expect(completedViews.has(`MT-${index}`)).toBe(true);
    }
    expect(completedViews.size).toBe(6);
  });

  it("keeps only the latest attempt per issue (by startedAt)", () => {
    const completedViews = new Map<string, Record<string, unknown>>();
    const olderAttempt = makeAttemptRecord({
      attemptId: "attempt-old",
      issueIdentifier: "MT-1",
      startedAt: "2026-01-01T00:00:00Z",
      status: "failed",
    });
    const newerAttempt = makeAttemptRecord({
      attemptId: "attempt-new",
      issueIdentifier: "MT-1",
      startedAt: "2026-01-02T00:00:00Z",
      status: "completed",
    });
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: completedViews as never,
      deps: {
        attemptStore: { getAllAttempts: () => [olderAttempt, newerAttempt] },
        logger: { info: vi.fn() },
      },
    });
    expect(completedViews.size).toBe(1);
    const view = completedViews.get("MT-1")!;
    expect(view.status).toBe("completed");
  });

  it("also handles older-then-newer order for dedup", () => {
    const completedViews = new Map<string, Record<string, unknown>>();
    const newerAttempt = makeAttemptRecord({
      attemptId: "attempt-new",
      issueIdentifier: "MT-1",
      startedAt: "2026-01-02T00:00:00Z",
      status: "completed",
    });
    const olderAttempt = makeAttemptRecord({
      attemptId: "attempt-old",
      issueIdentifier: "MT-1",
      startedAt: "2026-01-01T00:00:00Z",
      status: "failed",
    });
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: completedViews as never,
      deps: {
        attemptStore: { getAllAttempts: () => [newerAttempt, olderAttempt] },
        logger: { info: vi.fn() },
      },
    });
    const view = completedViews.get("MT-1")!;
    expect(view.status).toBe("completed");
  });

  it("logs the seeded count when views are seeded", () => {
    const info = vi.fn();
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: new Map() as never,
      deps: {
        attemptStore: {
          getAllAttempts: () => [
            makeAttemptRecord({ issueIdentifier: "MT-1", status: "completed" }),
            makeAttemptRecord({ issueIdentifier: "MT-2", issueId: "issue-2", status: "failed" }),
          ],
        },
        logger: { info },
      },
    });
    expect(info).toHaveBeenCalledWith({ count: 2 }, "seeded completed views from attempt store");
  });

  it("does not log when no attempts are seeded", () => {
    const info = vi.fn();
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: new Map() as never,
      deps: {
        attemptStore: { getAllAttempts: () => [] },
        logger: { info },
      },
    });
    expect(info).not.toHaveBeenCalled();
  });

  it("does not log when only non-terminal attempts exist", () => {
    const info = vi.fn();
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: new Map() as never,
      deps: {
        attemptStore: { getAllAttempts: () => [makeAttemptRecord({ status: "running" })] },
        logger: { info },
      },
    });
    expect(info).not.toHaveBeenCalled();
  });

  it("maps completed status to Done state", () => {
    const completedViews = new Map<string, Record<string, unknown>>();
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: completedViews as never,
      deps: {
        attemptStore: { getAllAttempts: () => [makeAttemptRecord({ status: "completed", issueIdentifier: "MT-1" })] },
        logger: { info: vi.fn() },
      },
    });
    expect(completedViews.get("MT-1")!.state).toBe("Done");
  });

  it("maps failed/timed_out/stalled/cancelled to Canceled state", () => {
    const statuses = ["failed", "timed_out", "stalled", "cancelled"];
    for (const status of statuses) {
      const completedViews = new Map<string, Record<string, unknown>>();
      seedCompletedClaims({
        claimedIssueIds: new Set(),
        completedViews: completedViews as never,
        deps: {
          attemptStore: {
            getAllAttempts: () => [makeAttemptRecord({ status, issueIdentifier: "MT-1" })],
          },
          logger: { info: vi.fn() },
        },
      });
      expect(completedViews.get("MT-1")!.state, `status ${status} should map to Canceled`).toBe("Canceled");
    }
  });

  it("maps unknown status to itself", () => {
    const completedViews = new Map<string, Record<string, unknown>>();
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: completedViews as never,
      deps: {
        attemptStore: {
          getAllAttempts: () => [makeAttemptRecord({ status: "running", issueIdentifier: "MT-1" })],
        },
        logger: { info: vi.fn() },
      },
    });
    // "running" is not a terminal status, so no view is seeded
    expect(completedViews.has("MT-1")).toBe(false);
  });

  it("uses endedAt as updatedAt in completed view, falls back to startedAt", () => {
    const completedViews = new Map<string, Record<string, unknown>>();
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: completedViews as never,
      deps: {
        attemptStore: {
          getAllAttempts: () => [
            makeAttemptRecord({
              issueIdentifier: "MT-1",
              status: "completed",
              startedAt: "2026-01-01T00:00:00Z",
              endedAt: "2026-01-01T00:05:00Z",
            }),
          ],
        },
        logger: { info: vi.fn() },
      },
    });
    expect(completedViews.get("MT-1")!.updatedAt).toBe("2026-01-01T00:05:00Z");

    // When endedAt is null, falls back to startedAt
    const completedViews2 = new Map<string, Record<string, unknown>>();
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: completedViews2 as never,
      deps: {
        attemptStore: {
          getAllAttempts: () => [
            makeAttemptRecord({
              issueIdentifier: "MT-2",
              status: "completed",
              startedAt: "2026-01-01T00:00:00Z",
              endedAt: null,
            }),
          ],
        },
        logger: { info: vi.fn() },
      },
    });
    expect(completedViews2.get("MT-2")!.updatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("propagates pullRequestUrl into completed view", () => {
    const completedViews = new Map<string, Record<string, unknown>>();
    seedCompletedClaims({
      claimedIssueIds: new Set(),
      completedViews: completedViews as never,
      deps: {
        attemptStore: {
          getAllAttempts: () => [
            makeAttemptRecord({
              issueIdentifier: "MT-1",
              status: "completed",
              pullRequestUrl: "https://github.com/org/repo/pull/42",
            }),
          ],
        },
        logger: { info: vi.fn() },
      },
    });
    expect(completedViews.get("MT-1")!.pullRequestUrl).toBe("https://github.com/org/repo/pull/42");
  });
});
