import { describe, expect, it, vi } from "vitest";

import { writeCompletionWriteback } from "../../src/orchestrator/worker-outcome/completion-writeback.js";
import type {
  CompletionWritebackContext,
  CompletionWritebackInput,
} from "../../src/orchestrator/worker-outcome/completion-writeback.js";
import type { ServiceConfig } from "../../src/core/types.js";
import { createIssue, createRunningEntry } from "./issue-test-factories.js";

function makeConfig(overrides: Partial<ServiceConfig["agent"]> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "key",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "MT",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
    agent: {
      maxConcurrentAgents: 5,
      maxConcurrentAgentsByState: {},
      maxTurns: 10,
      maxRetryBackoffMs: 300_000,
      maxContinuationAttempts: 5,
      successState: null,
      stallTimeoutMs: 1_200_000,
      ...overrides,
    },
  } as unknown as ServiceConfig;
}

function makeCtx(overrides: { successState?: string | null } = {}): CompletionWritebackContext {
  const config = makeConfig({ successState: overrides.successState ?? null });
  return {
    getConfig: () => config,
    deps: {
      tracker: {
        resolveStateId: vi.fn().mockResolvedValue(null),
        updateIssueState: vi.fn().mockResolvedValue(undefined),
        createComment: vi.fn().mockResolvedValue(undefined),
      },
      logger: { info: vi.fn(), warn: vi.fn() },
    },
  };
}

function makeInput(overrides: Partial<CompletionWritebackInput> = {}): CompletionWritebackInput {
  const now = Date.now();
  return {
    issue: createIssue(),
    entry: createRunningEntry({ startedAtMs: now - 30_000, tokenUsage: null }),
    attempt: 1,
    stopSignal: "done",
    pullRequestUrl: null,
    ...overrides,
  };
}

describe("writeCompletionWriteback — comment content", () => {
  it("includes the completion header", async () => {
    const ctx = makeCtx();
    const input = makeInput();

    await writeCompletionWriteback(ctx, input);

    const createComment = ctx.deps.tracker.createComment as ReturnType<typeof vi.fn>;
    expect(createComment).toHaveBeenCalledOnce();
    const body = createComment.mock.calls[0][1] as string;
    expect(body).toContain("**Risoluto agent completed**");
  });

  it("includes token usage when available", async () => {
    const ctx = makeCtx();
    const entry = createRunningEntry({
      tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });
    const input = makeInput({ entry });

    await writeCompletionWriteback(ctx, input);

    const createComment = ctx.deps.tracker.createComment as ReturnType<typeof vi.fn>;
    const body = createComment.mock.calls[0][1] as string;
    expect(body).toContain("**Tokens:**");
    expect(body).toContain("1,500");
    expect(body).toContain("1,000");
    expect(body).toContain("500");
  });

  it("omits token line when tokenUsage is null", async () => {
    const ctx = makeCtx();
    const input = makeInput({ entry: createRunningEntry({ tokenUsage: null }) });

    await writeCompletionWriteback(ctx, input);

    const createComment = ctx.deps.tracker.createComment as ReturnType<typeof vi.fn>;
    const body = createComment.mock.calls[0][1] as string;
    expect(body).not.toContain("**Tokens:**");
  });

  it("includes duration in seconds", async () => {
    const now = Date.now();
    const ctx = makeCtx();
    const entry = createRunningEntry({ startedAtMs: now - 45_000 });
    const input = makeInput({ entry });

    await writeCompletionWriteback(ctx, input);

    const createComment = ctx.deps.tracker.createComment as ReturnType<typeof vi.fn>;
    const body = createComment.mock.calls[0][1] as string;
    expect(body).toContain("**Duration:**");
    // Should be approximately 45s (could vary slightly due to timing)
    expect(body).toMatch(/\*\*Duration:\*\* \d+s/);
  });

  it("includes attempt number when not null", async () => {
    const ctx = makeCtx();
    const input = makeInput({ attempt: 3 });

    await writeCompletionWriteback(ctx, input);

    const createComment = ctx.deps.tracker.createComment as ReturnType<typeof vi.fn>;
    const body = createComment.mock.calls[0][1] as string;
    expect(body).toContain("**Attempt:** 3");
  });

  it("omits attempt line when attempt is null", async () => {
    const ctx = makeCtx();
    const input = makeInput({ attempt: null });

    await writeCompletionWriteback(ctx, input);

    const createComment = ctx.deps.tracker.createComment as ReturnType<typeof vi.fn>;
    const body = createComment.mock.calls[0][1] as string;
    expect(body).not.toContain("**Attempt:**");
  });

  it("includes PR URL when available", async () => {
    const ctx = makeCtx();
    const input = makeInput({ pullRequestUrl: "https://github.com/org/repo/pull/42" });

    await writeCompletionWriteback(ctx, input);

    const createComment = ctx.deps.tracker.createComment as ReturnType<typeof vi.fn>;
    const body = createComment.mock.calls[0][1] as string;
    expect(body).toContain("**PR:** https://github.com/org/repo/pull/42");
  });

  it("omits PR line when pullRequestUrl is null", async () => {
    const ctx = makeCtx();
    const input = makeInput({ pullRequestUrl: null });

    await writeCompletionWriteback(ctx, input);

    const createComment = ctx.deps.tracker.createComment as ReturnType<typeof vi.fn>;
    const body = createComment.mock.calls[0][1] as string;
    expect(body).not.toContain("**PR:**");
  });
});

describe("writeCompletionWriteback — state transition", () => {
  it("transitions issue to success state when signal is done and successState is configured", async () => {
    const ctx = makeCtx({ successState: "Done" });
    const resolveStateId = ctx.deps.tracker.resolveStateId as ReturnType<typeof vi.fn>;
    resolveStateId.mockResolvedValue("state-done-id");
    const input = makeInput({ stopSignal: "done" });

    await writeCompletionWriteback(ctx, input);

    expect(resolveStateId).toHaveBeenCalledWith("Done");
    expect(ctx.deps.tracker.updateIssueState).toHaveBeenCalledWith(input.issue.id, "state-done-id");
    expect(ctx.deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ issue_identifier: input.issue.identifier, successState: "Done" }),
      "linear issue transitioned to success state",
    );
  });

  it("skips transition when successState is null", async () => {
    const ctx = makeCtx({ successState: null });
    const input = makeInput({ stopSignal: "done" });

    await writeCompletionWriteback(ctx, input);

    expect(ctx.deps.tracker.resolveStateId).not.toHaveBeenCalled();
    expect(ctx.deps.tracker.updateIssueState).not.toHaveBeenCalled();
  });

  it("skips transition when signal is blocked even with successState configured", async () => {
    const ctx = makeCtx({ successState: "Done" });
    const input = makeInput({ stopSignal: "blocked" });

    await writeCompletionWriteback(ctx, input);

    expect(ctx.deps.tracker.resolveStateId).not.toHaveBeenCalled();
    expect(ctx.deps.tracker.updateIssueState).not.toHaveBeenCalled();
  });

  it("warns when resolveStateId returns null (state not found)", async () => {
    const ctx = makeCtx({ successState: "NonExistent" });
    const resolveStateId = ctx.deps.tracker.resolveStateId as ReturnType<typeof vi.fn>;
    resolveStateId.mockResolvedValue(null);
    const input = makeInput({ stopSignal: "done" });

    await writeCompletionWriteback(ctx, input);

    expect(ctx.deps.tracker.updateIssueState).not.toHaveBeenCalled();
    expect(ctx.deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ issue_identifier: input.issue.identifier, successState: "NonExistent" }),
      expect.stringContaining("success state not found"),
    );
  });

  it("swallows state transition error and logs warning", async () => {
    const ctx = makeCtx({ successState: "Done" });
    const resolveStateId = ctx.deps.tracker.resolveStateId as ReturnType<typeof vi.fn>;
    resolveStateId.mockRejectedValue(new Error("Linear API down"));
    const input = makeInput({ stopSignal: "done" });

    await writeCompletionWriteback(ctx, input);

    expect(ctx.deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ issue_identifier: input.issue.identifier, error: "Linear API down" }),
      expect.stringContaining("linear state transition failed"),
    );
    // Still posts comment despite transition failure
    expect(ctx.deps.tracker.createComment).toHaveBeenCalledOnce();
  });
});

describe("writeCompletionWriteback — comment failure handling", () => {
  it("swallows createComment error and logs warning", async () => {
    const ctx = makeCtx();
    const createComment = ctx.deps.tracker.createComment as ReturnType<typeof vi.fn>;
    createComment.mockRejectedValue(new Error("API timeout"));
    const input = makeInput();

    // Should not throw
    await writeCompletionWriteback(ctx, input);

    expect(ctx.deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ issue_identifier: input.issue.identifier, error: "API timeout" }),
      expect.stringContaining("linear completion comment failed"),
    );
  });
});
