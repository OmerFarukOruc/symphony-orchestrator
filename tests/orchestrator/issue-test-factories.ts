import type { ModelSelection, RuntimeIssueView } from "../../src/core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "../../src/orchestrator/runtime-types.js";

export function createIssue(overrides?: Partial<RunningEntry["issue"]>): RunningEntry["issue"] {
  return {
    id: "issue-1",
    identifier: "MT-42",
    title: "Test Issue",
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-16T00:00:00Z",
    ...overrides,
  };
}

export function createWorkspace(overrides?: Partial<RunningEntry["workspace"]>): RunningEntry["workspace"] {
  return {
    path: "/tmp/symphony/MT-42",
    workspaceKey: "MT-42",
    createdNow: true,
    ...overrides,
  };
}

export function createModelSelection(overrides?: Partial<ModelSelection>): ModelSelection {
  return {
    model: "gpt-5.4",
    reasoningEffort: "high",
    source: "default",
    ...overrides,
  };
}

export function createRunningEntry(overrides?: Partial<RunningEntry>): RunningEntry {
  const now = Date.now();
  return {
    runId: "run-1",
    issue: createIssue(),
    workspace: createWorkspace(),
    startedAtMs: now - 60000,
    lastEventAtMs: now - 30000,
    attempt: 1,
    abortController: new AbortController(),
    promise: Promise.resolve(),
    cleanupOnExit: false,
    status: "running",
    sessionId: "session-1",
    tokenUsage: null,
    modelSelection: createModelSelection(),
    lastAgentMessageContent: null,
    repoMatch: null,
    queuePersistence: () => undefined,
    flushPersistence: async () => undefined,
    ...overrides,
  } as RunningEntry;
}

export function createRetryEntry(overrides?: Partial<RetryRuntimeEntry>): RetryRuntimeEntry {
  const now = Date.now();
  return {
    issueId: "issue-1",
    identifier: "MT-43",
    attempt: 2,
    dueAtMs: now + 30000,
    error: "turn_failed",
    timer: null,
    issue: createIssue({ id: "issue-1", identifier: "MT-43" }),
    workspaceKey: "MT-43",
    ...overrides,
  } as RetryRuntimeEntry;
}

export function createCompletedView(overrides?: Partial<RuntimeIssueView>): RuntimeIssueView {
  return {
    issueId: "issue-3",
    identifier: "MT-44",
    title: "Completed Issue",
    state: "Done",
    workspaceKey: "MT-44",
    message: "Completed successfully",
    status: "completed",
    updatedAt: "2026-03-16T00:00:00Z",
    attempt: 1,
    error: null,
    ...overrides,
  };
}

export function createDetailView(overrides?: Partial<RuntimeIssueView>): RuntimeIssueView {
  return {
    issueId: "issue-4",
    identifier: "MT-45",
    title: "Detail View Issue",
    state: "In Progress",
    workspaceKey: null,
    message: null,
    status: "queued",
    updatedAt: "2026-03-16T00:00:00Z",
    attempt: null,
    error: null,
    ...overrides,
  };
}
