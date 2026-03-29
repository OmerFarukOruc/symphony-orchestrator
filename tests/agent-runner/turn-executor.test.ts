import { describe, expect, it, vi } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("../../src/agent-runner/turn-state.js", () => ({
  waitForTurnCompletion: vi.fn(),
  composeSessionId: vi.fn().mockReturnValue("thread-1:turn-1"),
}));

vi.mock("../../src/agent-runner/abort-outcomes.js", () => ({
  outcomeForAbort: vi.fn().mockReturnValue({
    kind: "cancelled",
    errorCode: "shutdown",
    errorMessage: "worker cancelled during service shutdown",
    threadId: null,
    turnId: null,
    turnCount: 0,
  }),
  classifyRunError: vi.fn().mockImplementation((error: unknown) => ({
    kind: "failed",
    errorCode: "startup_failed",
    errorMessage: String(error),
    threadId: null,
    turnId: null,
    turnCount: 0,
  })),
  failureOutcome: vi.fn().mockReturnValue(null),
}));

vi.mock("../../src/agent-runner/exit-classifier.js", () => ({
  classifyExitState: vi.fn().mockResolvedValue({
    kind: "normal",
    errorCode: null,
    errorMessage: null,
    threadId: "thread-1",
    turnId: "turn-1",
    turnCount: 1,
  }),
}));

vi.mock("../../src/state/policy.js", () => ({
  isActiveState: vi.fn().mockReturnValue(true),
}));

vi.mock("../../src/core/content-sanitizer.js", () => ({
  sanitizeContent: vi.fn().mockImplementation((s: string) => s),
}));

vi.mock("../../src/agent-runner/thread-compact.js", () => ({
  compactThread: vi.fn().mockResolvedValue(true),
}));

import { executeTurns } from "../../src/agent-runner/turn-executor.js";
import { waitForTurnCompletion } from "../../src/agent-runner/turn-state.js";
import { isActiveState } from "../../src/state/policy.js";
import { failureOutcome, outcomeForAbort } from "../../src/agent-runner/abort-outcomes.js";
import { classifyExitState } from "../../src/agent-runner/exit-classifier.js";
import { compactThread } from "../../src/agent-runner/thread-compact.js";
import type {
  AgentRunnerTurnExecutionInput,
  AgentRunnerTurnExecutionState,
} from "../../src/agent-runner/turn-executor-types.js";
import type { ServiceConfig } from "../../src/core/types.js";
import { createMockLogger } from "../helpers.js";

function makeConfig(maxTurns = 5): ServiceConfig {
  return {
    agent: { maxTurns },
    codex: {
      approvalPolicy: "never",
      turnTimeoutMs: 10000,
      sandbox: { resources: {} },
      model: "gpt-4o",
      reasoningEffort: "high",
    },
  } as unknown as ServiceConfig;
}

function makeCompletedTurnResponse(status = "completed", error: Record<string, unknown> = {}) {
  return {
    turn: {
      status,
      error,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    },
  };
}

function makeInput(
  overrides: {
    maxTurns?: number;
    aborted?: boolean;
    abortReason?: string;
    issueActive?: boolean;
    requestResult?: unknown;
  } = {},
): AgentRunnerTurnExecutionInput {
  const { maxTurns = 5, aborted = false, abortReason, issueActive = true, requestResult } = overrides;
  const controller = new AbortController();
  if (aborted) {
    controller.abort(abortReason ?? "shutdown");
  }

  vi.mocked(isActiveState).mockReturnValue(issueActive);

  const connection = {
    request: vi.fn().mockResolvedValue(
      requestResult ?? {
        turnId: "turn-abc",
        turn: {
          status: "completed",
          error: {},
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        },
      },
    ),
  };

  vi.mocked(waitForTurnCompletion).mockResolvedValue(makeCompletedTurnResponse());

  return {
    connection,
    config: makeConfig(maxTurns),
    runInput: {
      issue: { id: "issue-1", identifier: "MT-1", title: "Test", state: "In Progress" },
      workspace: { path: "/tmp/ws" },
      modelSelection: { model: "gpt-4o", reasoningEffort: "high" },
      signal: controller.signal,
      onEvent: vi.fn(),
    },
    prompt: "Please fix the login bug.",
    setActiveTurnId: vi.fn(),
    turnState: {} as AgentRunnerTurnExecutionInput["turnState"],
    tracker: {
      fetchIssueStatesByIds: vi.fn().mockResolvedValue([{ id: "issue-1", identifier: "MT-1", state: "In Progress" }]),
    },
    logger: createMockLogger(),
  } as unknown as AgentRunnerTurnExecutionInput;
}

function makeState(turnCount = 0): AgentRunnerTurnExecutionState {
  return {
    turnCount,
    threadId: "thread-1",
    turnId: null,
    containerName: null,
    exitPromise: new Promise(() => undefined),
    getFatalFailure: vi.fn().mockReturnValue(null),
  } as unknown as AgentRunnerTurnExecutionState;
}

describe("executeTurns", () => {
  it("stops after one turn when issue becomes inactive", async () => {
    vi.mocked(isActiveState).mockReturnValueOnce(false); // issue inactive after first turn

    const input = makeInput();
    const state = makeState();

    const result = await executeTurns(input, state);

    // Normal exit (issue became inactive)
    expect(result.kind).toBe("normal");
    expect(state.turnCount).toBe(1);
  });

  it("uses issue prompt for the first turn", async () => {
    const input = makeInput();
    const state = makeState();

    vi.mocked(isActiveState).mockReturnValueOnce(false); // stop after first turn
    await executeTurns(input, state);

    const requestCall = (input.connection as { request: ReturnType<typeof vi.fn> }).request.mock.calls[0];
    expect(requestCall[1].input[0].text).toBe("Please fix the login bug.");
  });

  it("uses continuation prompt for subsequent turns", async () => {
    // First turn: issue still active. Second turn: issue inactive.
    vi.mocked(isActiveState).mockReturnValueOnce(true).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    const requestMock = (input.connection as { request: ReturnType<typeof vi.fn> }).request;
    expect(requestMock).toHaveBeenCalledTimes(2);
    const secondCall = requestMock.mock.calls[1];
    expect(secondCall[1].input[0].text).toContain("Continue the current issue");
  });

  it("stops immediately when abort signal is already set", async () => {
    const input = makeInput({ aborted: true });
    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("cancelled");
    expect(state.turnCount).toBe(0);
  });

  it("enforces maxTurns limit and calls classifyExitState", async () => {
    vi.mocked(isActiveState).mockReturnValue(true); // always active
    vi.mocked(classifyExitState).mockResolvedValue({
      kind: "normal",
      errorCode: null,
      errorMessage: null,
      threadId: "thread-1",
      turnId: "turn-1",
      turnCount: 2,
    });

    const input = makeInput({ maxTurns: 2 });
    const state = makeState();

    const result = await executeTurns(input, state);

    expect(state.turnCount).toBe(2);
    expect(classifyExitState).toHaveBeenCalled();
    expect(result.kind).toBe("normal");
  });

  it("returns failed outcome for turn status 'failed'", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    // Override after makeInput since makeInput resets the mock
    vi.mocked(waitForTurnCompletion).mockResolvedValue(
      makeCompletedTurnResponse("failed", { message: "model refused" }),
    );
    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("turn_failed");
    expect(result.errorMessage).toBe("model refused");
  });

  it("returns cancelled outcome for turn status 'interrupted'", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    // Override after makeInput since makeInput resets the mock
    vi.mocked(waitForTurnCompletion).mockResolvedValue(
      makeCompletedTurnResponse("interrupted", { message: "user aborted" }),
    );
    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("cancelled");
    expect(result.errorCode).toBe("interrupted");
  });

  it("returns fatal failure outcome when getFatalFailure returns non-null", async () => {
    vi.mocked(failureOutcome).mockReturnValueOnce({
      kind: "failed",
      errorCode: "mcp_error",
      errorMessage: "MCP crashed",
      threadId: "thread-1",
      turnId: null,
      turnCount: 0,
    });

    const input = makeInput();
    const state = makeState();
    vi.mocked(state.getFatalFailure).mockReturnValue({ code: "mcp_error", message: "MCP crashed" });

    const result = await executeTurns(input, state);
    expect(result.errorCode).toBe("mcp_error");
  });

  it("handles thrown errors via classifyRunError", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    // Override after makeInput since makeInput resets the mock
    vi.mocked(waitForTurnCompletion).mockRejectedValue(new Error("network failure"));
    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("startup_failed");
  });

  it("returns abort outcome when signal is aborted during exception handling", async () => {
    vi.mocked(waitForTurnCompletion).mockRejectedValue(new Error("crash"));
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput({ aborted: true });
    vi.mocked(failureOutcome).mockReturnValue(null);
    vi.mocked(outcomeForAbort).mockReturnValue({
      kind: "cancelled",
      errorCode: "shutdown",
      errorMessage: "worker cancelled during service shutdown",
      threadId: null,
      turnId: null,
      turnCount: 0,
    });

    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("cancelled");
    expect(result.errorCode).toBe("shutdown");
  });

  it("compacts thread and retries when context window is exceeded (error type)", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);
    vi.mocked(compactThread).mockResolvedValue(true);

    const input = makeInput();
    const state = makeState();

    // Override AFTER makeInput (which resets waitForTurnCompletion)
    vi.mocked(waitForTurnCompletion)
      .mockResolvedValueOnce(
        makeCompletedTurnResponse("failed", { message: "too long", type: "ContextWindowExceeded" }),
      )
      .mockResolvedValueOnce(makeCompletedTurnResponse());
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const result = await executeTurns(input, state);

    expect(compactThread).toHaveBeenCalledWith(input.connection, "thread-1", input.logger);
    // Failed turn should not be counted — turnCount stays at 1 (the retry)
    expect(state.turnCount).toBe(1);
    expect(result.kind).toBe("normal");
  });

  it("compacts thread and retries when error message contains 'context window'", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);
    vi.mocked(compactThread).mockResolvedValue(true);

    const input = makeInput();
    const state = makeState();

    // Override AFTER makeInput (which resets waitForTurnCompletion)
    vi.mocked(waitForTurnCompletion)
      .mockResolvedValueOnce(makeCompletedTurnResponse("failed", { message: "context window overflow detected" }))
      .mockResolvedValueOnce(makeCompletedTurnResponse());
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const result = await executeTurns(input, state);

    expect(compactThread).toHaveBeenCalled();
    expect(state.turnCount).toBe(1);
    expect(result.kind).toBe("normal");
  });

  it("compacts thread and retries when error message contains 'context length exceeded'", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);
    vi.mocked(compactThread).mockResolvedValue(true);

    const input = makeInput();
    const state = makeState();

    // Override AFTER makeInput (which resets waitForTurnCompletion)
    vi.mocked(waitForTurnCompletion)
      .mockResolvedValueOnce(makeCompletedTurnResponse("failed", { message: "context length exceeded" }))
      .mockResolvedValueOnce(makeCompletedTurnResponse());
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const result = await executeTurns(input, state);

    expect(compactThread).toHaveBeenCalled();
    expect(state.turnCount).toBe(1);
    expect(result.kind).toBe("normal");
  });

  it("returns failure when context window exceeded and compaction fails", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);
    vi.mocked(compactThread).mockReset().mockResolvedValue(false);

    const input = makeInput();
    const state = makeState();

    // Override AFTER makeInput (which resets waitForTurnCompletion)
    vi.mocked(waitForTurnCompletion).mockResolvedValue(
      makeCompletedTurnResponse("failed", { message: "context window exceeded" }),
    );

    const result = await executeTurns(input, state);

    expect(compactThread).toHaveBeenCalled();
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("context_window_exceeded");
    expect(result.errorMessage).toBe("context window exceeded and compaction failed");
  });

  it("detects context window error via codexErrorInfo.type", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);
    vi.mocked(compactThread).mockResolvedValue(true);

    const input = makeInput();
    const state = makeState();

    // Override AFTER makeInput (which resets waitForTurnCompletion)
    vi.mocked(waitForTurnCompletion)
      .mockResolvedValueOnce(
        makeCompletedTurnResponse("failed", {
          message: "request failed",
          codexErrorInfo: { type: "ContextWindowExceeded" },
        }),
      )
      .mockResolvedValueOnce(makeCompletedTurnResponse());
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const result = await executeTurns(input, state);

    expect(compactThread).toHaveBeenCalled();
    expect(state.turnCount).toBe(1);
    expect(result.kind).toBe("normal");
  });

  it("includes summary: 'concise' in turn/start request", async () => {
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    const requestMock = (input.connection as { request: ReturnType<typeof vi.fn> }).request;
    const params = requestMock.mock.calls[0][1];
    expect(params.summary).toBe("concise");
  });

  it("includes outputSchema when structuredOutput is true", async () => {
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    (input.config.codex as { structuredOutput: boolean }).structuredOutput = true;
    const state = makeState();

    await executeTurns(input, state);

    const requestMock = (input.connection as { request: ReturnType<typeof vi.fn> }).request;
    const params = requestMock.mock.calls[0][1];
    expect(params.outputSchema).toEqual({
      type: "object",
      properties: {
        status: { type: "string", enum: ["DONE", "BLOCKED", "CONTINUE"] },
        summary: { type: "string" },
      },
      required: ["status", "summary"],
    });
  });

  it("does not include outputSchema when structuredOutput is false", async () => {
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    const requestMock = (input.connection as { request: ReturnType<typeof vi.fn> }).request;
    const params = requestMock.mock.calls[0][1];
    expect(params.outputSchema).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: exact error message fallbacks
  // -------------------------------------------------------------------------

  it("uses 'turn failed' as default error message when completedError.message is absent", async () => {
    // Kills: StringLiteral turn-executor.ts:53 "turn failed" -> ""
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    vi.mocked(waitForTurnCompletion).mockResolvedValue(makeCompletedTurnResponse("failed", {}));
    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("failed");
    expect(result.errorMessage).toBe("turn failed");
  });

  it("uses 'turn interrupted' as default error message for interrupted status without message", async () => {
    // Kills: StringLiteral turn-executor.ts:77 "turn interrupted" -> ""
    // Kills: LogicalOperator turn-executor.ts:77 ?? -> &&
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    vi.mocked(waitForTurnCompletion).mockResolvedValue(makeCompletedTurnResponse("interrupted", {}));
    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("cancelled");
    expect(result.errorMessage).toBe("turn interrupted");
  });

  it("uses actual error message for interrupted status when message is present", async () => {
    // Kills: LogicalOperator turn-executor.ts:77 ?? -> && (ensures ?? correctly passes through the first truthy value)
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    vi.mocked(waitForTurnCompletion).mockResolvedValue(
      makeCompletedTurnResponse("interrupted", { message: "custom abort reason" }),
    );
    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("cancelled");
    expect(result.errorMessage).toBe("custom abort reason");
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: emitTurnCompletedEvent message construction
  // -------------------------------------------------------------------------

  it("emits 'turn N completed' message for completed status", async () => {
    // Kills: ConditionalExpression turn-executor.ts:96 if (completedStatus === "completed") -> if (false)
    // Kills: StringLiteral turn-executor.ts:96 "completed" -> ""
    // Kills: StringLiteral turn-executor.ts:97 rawMessage template -> ""
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    const onEvent = input.runInput.onEvent as ReturnType<typeof vi.fn>;
    expect(onEvent).toHaveBeenCalled();
    const eventArg = onEvent.mock.calls[0][0];
    expect(eventArg.message).toContain("turn 1 completed");
  });

  it("emits error message when completedError.message is present on non-completed status", async () => {
    // Kills: ConditionalExpression turn-executor.ts:98 else if (completedError.message) -> else if (true)
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    vi.mocked(waitForTurnCompletion).mockResolvedValue(
      makeCompletedTurnResponse("failed", { message: "model refused" }),
    );
    const state = makeState();

    await executeTurns(input, state);

    const onEvent = input.runInput.onEvent as ReturnType<typeof vi.fn>;
    const eventArg = onEvent.mock.calls[0][0];
    expect(eventArg.message).toBe("model refused");
  });

  it("emits 'turn N ended with status X' when no error message on non-completed status", async () => {
    // Kills: StringLiteral turn-executor.ts:102 rawMessage template -> ""
    // Kills: StringLiteral turn-executor.ts:111 fallback template -> ""
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    // Use a status that is neither "completed" nor "failed"/"interrupted" to
    // exercise the fallback message path without triggering classifyTurnResult early return
    vi.mocked(waitForTurnCompletion).mockResolvedValue({
      turn: {
        status: "unknown_status",
        error: {},
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    });
    vi.mocked(isActiveState).mockReturnValueOnce(false);
    const state = makeState();

    await executeTurns(input, state);

    const onEvent = input.runInput.onEvent as ReturnType<typeof vi.fn>;
    const eventArg = onEvent.mock.calls[0][0];
    expect(eventArg.message).toContain("turn 1 ended with status unknown_status");
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: rateLimits operator
  // -------------------------------------------------------------------------

  it("passes rateLimits from turn result to event", async () => {
    // Kills: LogicalOperator turn-executor.ts:113 rateLimits ?? undefined -> && undefined
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput({
      requestResult: {
        turnId: "turn-abc",
        rateLimits: { remaining: 42 },
      },
    });
    const state = makeState();

    await executeTurns(input, state);

    const onEvent = input.runInput.onEvent as ReturnType<typeof vi.fn>;
    const eventArg = onEvent.mock.calls[0][0];
    expect(eventArg.rateLimits).toEqual({ remaining: 42 });
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: request params
  // -------------------------------------------------------------------------

  it("passes type: 'text' in input array", async () => {
    // Kills: StringLiteral turn-executor.ts:132 "text" -> ""
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    const requestMock = (input.connection as { request: ReturnType<typeof vi.fn> }).request;
    const params = requestMock.mock.calls[0][1];
    expect(params.input[0].type).toBe("text");
  });

  it("throws with descriptive message when turn/start returns no turn identifier", async () => {
    // Kills: StringLiteral turn-executor.ts:137 "turn/start did not return..." -> ""
    const input = makeInput({
      requestResult: { turnId: null, turn: {} },
    });

    // Make extractTurnId return null by having no valid turnId
    const connection = input.connection as { request: ReturnType<typeof vi.fn> };
    connection.request.mockResolvedValue({});

    const state = makeState();

    const result = await executeTurns(input, state);
    // The error is caught by handleExecutionError
    expect(result.kind).toBe("failed");
    expect(result.errorMessage).toContain("turn/start did not return a turn identifier");
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: completedStatus fallback
  // -------------------------------------------------------------------------

  it("defaults completedStatus to 'failed' when status field is missing", async () => {
    // Kills: StringLiteral turn-executor.ts:148 "failed" -> ""
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    // Return a turn with no status field — should default to "failed"
    vi.mocked(waitForTurnCompletion).mockResolvedValue({
      turn: { error: { message: "no status" } },
    });
    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("turn_failed");
    expect(result.errorMessage).toBe("no status");
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: tracker.fetchIssueStatesByIds argument
  // -------------------------------------------------------------------------

  it("passes the current issue id to fetchIssueStatesByIds", async () => {
    // Kills: ArrayDeclaration turn-executor.ts:160 [input.runInput.issue.id] -> []
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    const tracker = input.tracker as { fetchIssueStatesByIds: ReturnType<typeof vi.fn> };
    expect(tracker.fetchIssueStatesByIds).toHaveBeenCalledWith(["issue-1"]);
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: tryCompactAndRetry false fallback
  // -------------------------------------------------------------------------

  it("returns context_window_exceeded when threadId is null and compaction cannot run", async () => {
    // Kills: BooleanLiteral turn-executor.ts:193 false -> true
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    const state = makeState();
    state.threadId = null; // No thread ID — compaction cannot run

    vi.mocked(waitForTurnCompletion).mockResolvedValue(
      makeCompletedTurnResponse("failed", { message: "context window exceeded" }),
    );

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("context_window_exceeded");
  });

  // -------------------------------------------------------------------------
  // Mutation-killing: handleExecutionError abort check
  // -------------------------------------------------------------------------

  it("returns abort outcome from handleExecutionError when signal is aborted during throw", async () => {
    // Kills: ConditionalExpression turn-executor.ts:250 if (input.runInput.signal.aborted) -> if (false)
    // Kills: BlockStatement turn-executor.ts:250 block removal
    const controller = new AbortController();

    const input = makeInput();
    // Replace the signal with one we can abort mid-flight
    Object.defineProperty(input.runInput, "signal", { value: controller.signal, writable: true });

    vi.mocked(waitForTurnCompletion).mockImplementation(async () => {
      controller.abort("shutdown");
      throw new Error("connection lost");
    });
    vi.mocked(failureOutcome).mockReturnValue(null);
    vi.mocked(outcomeForAbort).mockReturnValue({
      kind: "cancelled",
      errorCode: "shutdown",
      errorMessage: "worker cancelled during service shutdown",
      threadId: null,
      turnId: null,
      turnCount: 0,
    });

    const state = makeState();

    const result = await executeTurns(input, state);

    expect(result.kind).toBe("cancelled");
    expect(result.errorCode).toBe("shutdown");
    expect(outcomeForAbort).toHaveBeenCalled();
  });
});
