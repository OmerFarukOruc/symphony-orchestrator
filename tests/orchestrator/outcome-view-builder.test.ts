import { describe, expect, it } from "vitest";

import { buildOutcomeView } from "../../src/orchestrator/outcome-view-builder.js";
import type { Issue, ModelSelection, Workspace } from "../../src/core/types.js";
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
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    path: "/tmp/workspaces/MT-1",
    workspaceKey: "workspace-key-abc",
    createdNow: true,
    ...overrides,
  };
}

function makeModelSelection(overrides: Partial<ModelSelection> = {}): ModelSelection {
  return {
    model: "gpt-4o",
    reasoningEffort: "high",
    source: "default",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    runId: "run-abc",
    issue: makeIssue(),
    workspace: makeWorkspace(),
    startedAtMs: Date.now(),
    lastEventAtMs: Date.now(),
    attempt: 1,
    abortController: new AbortController(),
    promise: Promise.resolve(),
    cleanupOnExit: false,
    status: "running",
    sessionId: "session-xyz",
    tokenUsage: null,
    modelSelection: makeModelSelection(),
    lastAgentMessageContent: null,
    repoMatch: null,
    queuePersistence: () => undefined,
    flushPersistence: async () => undefined,
    ...overrides,
  } as RunningEntry;
}

describe("buildOutcomeView", () => {
  it("sets status from overrides", () => {
    const view = buildOutcomeView(makeIssue(), makeWorkspace(), makeEntry(), makeModelSelection(), {
      status: "completed",
    });
    expect(view.status).toBe("completed");
  });

  it("sets workspaceKey from workspace", () => {
    const workspace = makeWorkspace({ workspaceKey: "my-ws-key" });
    const view = buildOutcomeView(makeIssue(), workspace, makeEntry(), makeModelSelection(), { status: "failed" });
    expect(view.workspaceKey).toBe("my-ws-key");
  });

  it("passes attempt, error, and message through overrides", () => {
    const view = buildOutcomeView(makeIssue(), makeWorkspace(), makeEntry(), makeModelSelection(), {
      status: "failed",
      attempt: 3,
      error: "turn_failed",
      message: "worker failed on turn 3",
    });
    expect(view.attempt).toBe(3);
    expect(view.error).toBe("turn_failed");
    expect(view.message).toBe("worker failed on turn 3");
  });

  it("preserves issue identity fields", () => {
    const issue = makeIssue({ id: "i-99", identifier: "MT-99", title: "Special issue" });
    const view = buildOutcomeView(issue, makeWorkspace(), makeEntry(), makeModelSelection(), { status: "completed" });
    expect(view.issueId).toBe("i-99");
    expect(view.identifier).toBe("MT-99");
    expect(view.title).toBe("Special issue");
  });

  it("includes model selection fields from entry and configured selection", () => {
    const entrySelection: ModelSelection = { model: "o3-mini", reasoningEffort: "low", source: "override" };
    const configuredSelection: ModelSelection = { model: "gpt-4o", reasoningEffort: "high", source: "default" };
    const entry = makeEntry({ modelSelection: entrySelection });
    const view = buildOutcomeView(makeIssue(), makeWorkspace(), entry, configuredSelection, { status: "completed" });
    expect(view.model).toBe("o3-mini");
    expect(view.reasoningEffort).toBe("low");
    expect(view.modelSource).toBe("override");
    expect(view.configuredModel).toBe("gpt-4o");
    expect(view.configuredReasoningEffort).toBe("high");
    expect(view.configuredModelSource).toBe("default");
    expect(view.modelChangePending).toBe(false);
  });

  it("defaults attempt, error, and message to undefined when not provided", () => {
    const view = buildOutcomeView(makeIssue(), makeWorkspace(), makeEntry(), makeModelSelection(), {
      status: "paused",
    });
    expect(view.attempt).toBeUndefined();
    expect(view.error).toBeUndefined();
    expect(view.message).toBeUndefined();
  });

  it("sets updatedAt and lastEventAt from entry.lastEventAtMs", () => {
    const lastEventAtMs = new Date("2026-03-15T12:30:00Z").getTime();
    const entry = makeEntry({ lastEventAtMs });
    const view = buildOutcomeView(makeIssue(), makeWorkspace(), entry, makeModelSelection(), {
      status: "completed",
    });
    expect(view.updatedAt).toBe("2026-03-15T12:30:00.000Z");
    expect(view.lastEventAt).toBe("2026-03-15T12:30:00.000Z");
  });

  it("sets startedAt from entry.startedAtMs", () => {
    const startedAtMs = new Date("2026-03-15T10:00:00Z").getTime();
    const entry = makeEntry({ startedAtMs });
    const view = buildOutcomeView(makeIssue(), makeWorkspace(), entry, makeModelSelection(), {
      status: "completed",
    });
    expect(view.startedAt).toBe("2026-03-15T10:00:00.000Z");
  });

  it("preserves entry tokenUsage in the outcome view", () => {
    const tokenUsage = { inputTokens: 300_000, outputTokens: 200_000, totalTokens: 500_000 };
    const entry = makeEntry({ tokenUsage });
    const view = buildOutcomeView(makeIssue(), makeWorkspace(), entry, makeModelSelection(), {
      status: "cancelled",
    });
    expect(view.tokenUsage).toEqual(tokenUsage);
  });
});
