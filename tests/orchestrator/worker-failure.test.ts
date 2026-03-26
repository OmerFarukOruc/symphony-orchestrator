import { describe, expect, it, vi } from "vitest";

import { handleWorkerFailure } from "../../src/orchestrator/worker-failure.js";
import { TokenRefreshError } from "../../src/codex/token-refresh.js";
import type { RunningEntry } from "../../src/orchestrator/runtime-types.js";
import type { WorkerFailureContext } from "../../src/orchestrator/worker-failure.js";
import { createIssue, createRunningEntry } from "./issue-test-factories.js";

function makeCtx(
  overrides: {
    updateAttempt?: ReturnType<typeof vi.fn>;
  } = {},
): {
  ctx: WorkerFailureContext;
  runningEntries: Map<string, RunningEntry>;
  releaseIssueClaim: ReturnType<typeof vi.fn>;
  pushEvent: ReturnType<typeof vi.fn>;
  updateAttempt: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  const runningEntries = new Map<string, RunningEntry>();
  const releaseIssueClaim = vi.fn();
  const pushEvent = vi.fn();
  const updateAttempt = overrides.updateAttempt ?? vi.fn().mockResolvedValue(undefined);
  const warn = vi.fn();

  const ctx: WorkerFailureContext = {
    runningEntries,
    releaseIssueClaim,
    pushEvent,
    deps: {
      attemptStore: { updateAttempt },
      logger: { warn },
    },
  };

  return { ctx, runningEntries, releaseIssueClaim, pushEvent, updateAttempt, warn };
}

// ---------------------------------------------------------------------------
// Core behavior: cleanup and event emission
// ---------------------------------------------------------------------------

describe("handleWorkerFailure - core behavior", () => {
  it("removes running entry, releases claim, and pushes worker_failed event", async () => {
    const { ctx, runningEntries, releaseIssueClaim, pushEvent, updateAttempt } = makeCtx();
    const entry = createRunningEntry({
      runId: "run-abc",
      sessionId: "sess-xyz",
      flushPersistence: vi.fn().mockResolvedValue(undefined),
    });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, new Error("boom"));

    expect(runningEntries.has("issue-1")).toBe(false);
    expect(releaseIssueClaim).toHaveBeenCalledWith("issue-1");
    expect(pushEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "worker_failed", message: "Error: boom" }));
    expect(updateAttempt).toHaveBeenCalledWith(
      "run-abc",
      expect.objectContaining({ status: "failed", errorCode: "worker_failed" }),
    );
  });

  it("stringifies non-Error thrown values in the event message", async () => {
    const { ctx, runningEntries, pushEvent } = makeCtx();
    const entry = createRunningEntry({
      runId: "run-abc",
      sessionId: "sess-xyz",
      flushPersistence: vi.fn().mockResolvedValue(undefined),
    });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, "string error");

    expect(pushEvent).toHaveBeenCalledWith(expect.objectContaining({ message: "string error" }));
  });

  it("includes session id, token usage, and null threadId in the attempt update", async () => {
    const { ctx, runningEntries, updateAttempt } = makeCtx();
    const tokenUsage = { input: 100, output: 50, total: 150 };
    const entry = createRunningEntry({ runId: "run-abc", sessionId: "sess-123", tokenUsage });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, new Error("crash"));

    expect(updateAttempt).toHaveBeenCalledWith(
      "run-abc",
      expect.objectContaining({
        tokenUsage,
        threadId: null,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// TokenRefreshError handling
// ---------------------------------------------------------------------------

describe("handleWorkerFailure - TokenRefreshError", () => {
  it("uses the TokenRefreshError code instead of generic worker_failed", async () => {
    const { ctx, runningEntries, updateAttempt } = makeCtx();
    const entry = createRunningEntry({
      runId: "run-abc",
      sessionId: "sess-xyz",
      flushPersistence: vi.fn().mockResolvedValue(undefined),
    });
    runningEntries.set("issue-1", entry);

    const tokenError = new TokenRefreshError("token_expired", "Token has expired");
    await handleWorkerFailure(ctx, createIssue(), entry, tokenError);

    expect(updateAttempt).toHaveBeenCalledWith("run-abc", expect.objectContaining({ errorCode: "token_expired" }));
  });
});

// ---------------------------------------------------------------------------
// Flush-failure fallback chain
// ---------------------------------------------------------------------------

describe("handleWorkerFailure - flush persistence fallback", () => {
  it("logs a warning and attempts fallback when flushPersistence rejects", async () => {
    const { ctx, runningEntries, warn, updateAttempt } = makeCtx();
    const entry = createRunningEntry({
      runId: "run-abc",
      flushPersistence: vi.fn().mockRejectedValue(new Error("flush failed")),
    });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, new Error("crash"));

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Error: flush failed" }),
      expect.stringContaining("failed to flush persistence"),
    );
    // Should still attempt the regular status update afterward
    expect(updateAttempt).toHaveBeenCalledWith("run-abc", expect.objectContaining({ errorCode: "flush_failed" }));
  });

  it("logs both warnings when flush and fallback both fail", async () => {
    const updateAttempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("fallback flush failed")) // flush fallback
      .mockRejectedValueOnce(new Error("status update failed")) // status update
      .mockRejectedValueOnce(new Error("status fallback failed")); // status fallback
    const { ctx, runningEntries, warn } = makeCtx({ updateAttempt });
    const entry = createRunningEntry({
      flushPersistence: vi.fn().mockRejectedValue(new Error("flush error")),
    });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, new Error("crash"));

    // Should have logged the flush failure warning
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Error: flush error" }),
      expect.stringContaining("failed to flush persistence"),
    );
    // And the fallback flush failure warning
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Error: fallback flush failed" }),
      expect.stringContaining("fallback attempt update also failed"),
    );
  });
});

// ---------------------------------------------------------------------------
// Status update fallback chain
// ---------------------------------------------------------------------------

describe("handleWorkerFailure - status update fallback", () => {
  it("attempts fallback error code when main status update fails", async () => {
    const updateAttempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("update failed")) // main update
      .mockResolvedValueOnce(undefined); // fallback
    const { ctx, runningEntries, warn } = makeCtx({ updateAttempt });
    const entry = createRunningEntry({
      runId: "run-abc",
      sessionId: "sess-xyz",
      flushPersistence: vi.fn().mockResolvedValue(undefined),
    });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, new Error("crash"));

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Error: update failed" }),
      expect.stringContaining("failed to update attempt status"),
    );
    // Fallback should write errorCode: "update_failed"
    expect(updateAttempt).toHaveBeenLastCalledWith("run-abc", { errorCode: "update_failed" });
  });

  it("logs warning when both main update and fallback fail", async () => {
    const updateAttempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("update failed"))
      .mockRejectedValueOnce(new Error("fallback failed"));
    const { ctx, runningEntries, warn } = makeCtx({ updateAttempt });
    const entry = createRunningEntry({
      runId: "run-abc",
      sessionId: "sess-xyz",
      flushPersistence: vi.fn().mockResolvedValue(undefined),
    });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, new Error("crash"));

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Error: fallback failed" }),
      expect.stringContaining("fallback error code update also failed"),
    );
  });
});

// ---------------------------------------------------------------------------
// Entry state after failure
// ---------------------------------------------------------------------------

describe("handleWorkerFailure - entry state", () => {
  it("always removes running entry even when updates fail", async () => {
    const updateAttempt = vi.fn().mockRejectedValue(new Error("all updates fail"));
    const { ctx, runningEntries } = makeCtx({ updateAttempt });
    const entry = createRunningEntry({
      flushPersistence: vi.fn().mockRejectedValue(new Error("flush fails too")),
    });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, new Error("crash"));

    expect(runningEntries.has("issue-1")).toBe(false);
  });

  it("always releases the issue claim even when updates fail", async () => {
    const updateAttempt = vi.fn().mockRejectedValue(new Error("all updates fail"));
    const { ctx, runningEntries, releaseIssueClaim } = makeCtx({ updateAttempt });
    const entry = createRunningEntry({
      flushPersistence: vi.fn().mockRejectedValue(new Error("flush fails")),
    });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, new Error("crash"));

    expect(releaseIssueClaim).toHaveBeenCalledWith("issue-1");
  });

  it("always pushes the worker_failed event even when persistence fails", async () => {
    const updateAttempt = vi.fn().mockRejectedValue(new Error("fail"));
    const { ctx, runningEntries, pushEvent } = makeCtx({ updateAttempt });
    const entry = createRunningEntry({
      flushPersistence: vi.fn().mockRejectedValue(new Error("flush fail")),
    });
    runningEntries.set("issue-1", entry);

    await handleWorkerFailure(ctx, createIssue(), entry, new Error("crash"));

    expect(pushEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "worker_failed" }));
  });
});
