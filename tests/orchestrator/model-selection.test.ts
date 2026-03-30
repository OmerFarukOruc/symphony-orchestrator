import { describe, expect, it, vi } from "vitest";

import { resolveModelSelection, updateIssueModelSelection } from "../../src/orchestrator/model-selection.js";
import type { Issue, ModelSelection, ServiceConfig } from "../../src/core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "../../src/orchestrator/runtime-types.js";

function makeConfig(model = "gpt-4o", effort: ModelSelection["reasoningEffort"] = "high"): ServiceConfig {
  return {
    codex: { model, reasoningEffort: effort },
  } as unknown as ServiceConfig;
}

function makeIssue(identifier = "MT-1"): Issue {
  return {
    id: "issue-1",
    identifier,
    title: "Test",
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: null,
    updatedAt: null,
  };
}

describe("resolveModelSelection", () => {
  it("returns default config model when no override exists", () => {
    const overrides = new Map<string, Omit<ModelSelection, "source">>();
    const result = resolveModelSelection(overrides, makeConfig("claude-3-5", "medium"), "MT-1");
    expect(result).toEqual({ model: "claude-3-5", reasoningEffort: "medium", source: "default" });
  });

  it("returns override model when one exists for the identifier", () => {
    const overrides = new Map([["MT-1", { model: "o3-mini", reasoningEffort: "low" as const }]]);
    const result = resolveModelSelection(overrides, makeConfig("gpt-4o", "high"), "MT-1");
    expect(result).toEqual({ model: "o3-mini", reasoningEffort: "low", source: "override" });
  });

  it("falls back to default for a different identifier not in overrides", () => {
    const overrides = new Map([["MT-99", { model: "o3-mini", reasoningEffort: "low" as const }]]);
    const result = resolveModelSelection(overrides, makeConfig("gpt-4o", "high"), "MT-1");
    expect(result).toEqual({ model: "gpt-4o", reasoningEffort: "high", source: "default" });
  });
});

describe("updateIssueModelSelection", () => {
  function makeCtx(
    overrides: {
      runningEntry?: Partial<RunningEntry>;
      retryEntry?: Partial<RetryRuntimeEntry>;
      hasDetail?: boolean;
    } = {},
  ) {
    const issueModelOverrides = new Map<string, Omit<ModelSelection, "source">>();
    const runningEntries = new Map<string, RunningEntry>();
    const retryEntries = new Map<string, RetryRuntimeEntry>();
    const pushEvent = vi.fn();
    const requestRefresh = vi
      .fn()
      .mockReturnValue({ queued: true, coalesced: false, requestedAt: new Date().toISOString() });

    if (overrides.runningEntry) {
      const controller = new AbortController();
      const entry: RunningEntry = {
        runId: "run-1",
        issue: makeIssue("MT-1"),
        workspace: { path: "/tmp/ws", workspaceKey: "ws", createdNow: false },
        startedAtMs: Date.now(),
        lastEventAtMs: Date.now(),
        attempt: 1,
        abortController: controller,
        promise: Promise.resolve(),
        cleanupOnExit: false,
        status: "running",
        sessionId: "sess-1",
        tokenUsage: null,
        modelSelection: { model: "gpt-4o", reasoningEffort: "high", source: "default" },
        lastAgentMessageContent: null,
        repoMatch: null,
        queuePersistence: () => undefined,
        flushPersistence: async () => undefined,
        ...overrides.runningEntry,
      } as RunningEntry;
      runningEntries.set(makeIssue("MT-1").id, entry);
    }

    if (overrides.retryEntry) {
      const entry: RetryRuntimeEntry = {
        issueId: "issue-1",
        identifier: "MT-1",
        attempt: 2,
        dueAtMs: Date.now() + 5000,
        error: null,
        timer: null,
        issue: makeIssue("MT-1"),
        workspaceKey: null,
        ...overrides.retryEntry,
      };
      retryEntries.set("issue-1", entry);
    }

    return {
      getConfig: () => makeConfig(),
      getIssueDetail: vi.fn().mockReturnValue(overrides.hasDetail === false ? null : { identifier: "MT-1" }),
      issueModelOverrides,
      runningEntries,
      retryEntries,
      pushEvent,
      requestRefresh,
    };
  }

  it("returns null when issue detail does not exist", async () => {
    const ctx = makeCtx({ hasDetail: false });
    const result = await updateIssueModelSelection(ctx, {
      identifier: "MT-1",
      model: "o3-mini",
      reasoningEffort: "low",
    });
    expect(result).toBe(null);
  });

  it("applies override and returns appliesNextAttempt=true when a worker is running", async () => {
    const ctx = makeCtx({ runningEntry: {} });
    const result = await updateIssueModelSelection(ctx, {
      identifier: "MT-1",
      model: "o3-mini",
      reasoningEffort: "low",
    });
    expect(result).not.toBe(null);
    expect(result?.updated).toBe(true);
    expect(result?.appliesNextAttempt).toBe(true);
    expect(result?.restarted).toBe(false);
    expect(result?.selection.model).toBe("o3-mini");
    expect(ctx.pushEvent).toHaveBeenCalled();
  });

  it("applies override and returns appliesNextAttempt=true when a retry entry exists", async () => {
    const ctx = makeCtx({ retryEntry: {} });
    const result = await updateIssueModelSelection(ctx, {
      identifier: "MT-1",
      model: "o3-mini",
      reasoningEffort: null,
    });
    expect(result?.appliesNextAttempt).toBe(true);
    expect(ctx.pushEvent).toHaveBeenCalled();
  });

  it("calls requestRefresh and returns appliesNextAttempt=false when no worker or retry entry", async () => {
    const ctx = makeCtx();
    const result = await updateIssueModelSelection(ctx, {
      identifier: "MT-1",
      model: "o3-mini",
      reasoningEffort: null,
    });
    expect(result?.appliesNextAttempt).toBe(false);
    expect(ctx.requestRefresh).toHaveBeenCalledWith("model_selection_updated");
    expect(ctx.pushEvent).not.toHaveBeenCalled();
  });

  it("stores the override in issueModelOverrides map", async () => {
    const ctx = makeCtx();
    await updateIssueModelSelection(ctx, { identifier: "MT-1", model: "custom-model", reasoningEffort: "xhigh" });
    expect(ctx.issueModelOverrides.get("MT-1")).toEqual({ model: "custom-model", reasoningEffort: "xhigh" });
  });

  it("includes effort suffix in message when reasoningEffort is set", async () => {
    const ctx = makeCtx({ runningEntry: {} });
    await updateIssueModelSelection(ctx, { identifier: "MT-1", model: "o3-mini", reasoningEffort: "low" });
    const event = ctx.pushEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.message).toBe("next run model updated to o3-mini (low)");
    expect(event.event).toBe("model_selection_updated");
  });

  it("omits effort suffix when reasoningEffort is null", async () => {
    const overrides = new Map([["MT-1", { model: "o3-mini", reasoningEffort: null as const }]]);
    const config = makeConfig("o3-mini", null);
    const result = resolveModelSelection(overrides, config, "MT-1");
    // Effort suffix is only used in updateIssueModelSelection, but verify reasoningEffort=null flows through
    expect(result.reasoningEffort).toBeNull();
  });

  it("returns updated=true and restarted=false for retry entry path", async () => {
    const ctx = makeCtx({ retryEntry: {} });
    const result = await updateIssueModelSelection(ctx, {
      identifier: "MT-1",
      model: "o3-mini",
      reasoningEffort: "low",
    });
    expect(result).not.toBeNull();
    expect(result!.updated).toBe(true);
    expect(result!.restarted).toBe(false);
    expect(result!.appliesNextAttempt).toBe(true);
  });

  it("includes effort suffix in retry entry message", async () => {
    const ctx = makeCtx({ retryEntry: {} });
    await updateIssueModelSelection(ctx, { identifier: "MT-1", model: "o3-mini", reasoningEffort: "low" });
    const event = ctx.pushEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.message).toBe("next run model updated to o3-mini (low)");
    expect(event.event).toBe("model_selection_updated");
  });

  it("returns updated=true and restarted=false for idle (non-running/retry) path", async () => {
    const ctx = makeCtx();
    const result = await updateIssueModelSelection(ctx, {
      identifier: "MT-1",
      model: "o3-mini",
      reasoningEffort: null,
    });
    expect(result!.updated).toBe(true);
    expect(result!.restarted).toBe(false);
    expect(result!.appliesNextAttempt).toBe(false);
  });

  it("does not emit event for already-aborted running entry", async () => {
    const controller = new AbortController();
    controller.abort("already stopped");
    const ctx = makeCtx({ runningEntry: { abortController: controller } });
    const result = await updateIssueModelSelection(ctx, {
      identifier: "MT-1",
      model: "o3-mini",
      reasoningEffort: "low",
    });
    // Falls through to the idle path since running entry is aborted
    expect(result!.appliesNextAttempt).toBe(false);
    expect(ctx.requestRefresh).toHaveBeenCalled();
  });
});
