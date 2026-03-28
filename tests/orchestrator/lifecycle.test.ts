import { describe, expect, it, vi } from "vitest";

import {
  reconcileRunningAndRetrying,
  refreshQueueViews,
  cleanupTerminalIssueWorkspaces,
} from "../../src/orchestrator/lifecycle.js";
import type { Issue, ServiceConfig } from "../../src/core/types.js";
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
});
