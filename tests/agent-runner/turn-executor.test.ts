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

  it("includes summary: 'detailed' in turn/start request", async () => {
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    const requestMock = (input.connection as { request: ReturnType<typeof vi.fn> }).request;
    const params = requestMock.mock.calls[0][1];
    expect(params.summary).toBe("detailed");
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

  it("stops loop when getLastStopSignal returns a non-null signal", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    (input as { getLastStopSignal: () => string | null }).getLastStopSignal = vi
      .fn()
      .mockReturnValueOnce(null) // first check: no signal yet
      .mockReturnValueOnce("done"); // second turn: signal detected

    // First turn continues, second turn detects stop signal
    vi.mocked(waitForTurnCompletion)
      .mockResolvedValueOnce(makeCompletedTurnResponse())
      .mockResolvedValueOnce(makeCompletedTurnResponse());

    const state = makeState();
    const result = await executeTurns(input, state);

    expect(result.kind).toBe("normal");
    expect(state.turnCount).toBe(2);
  });

  it("falls back to getLastAgentMessageContent when getLastStopSignal is not provided", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    // No getLastStopSignal — should fall through to getLastAgentMessageContent
    delete (input as Record<string, unknown>).getLastStopSignal;
    (input as { getLastAgentMessageContent: () => string | null }).getLastAgentMessageContent = vi
      .fn()
      .mockReturnValue("All done.\nRISOLUTO_STATUS: DONE");

    const state = makeState();
    const result = await executeTurns(input, state);

    // Should exit after detecting stop signal in content
    expect(result.kind).toBe("normal");
    expect(state.turnCount).toBe(1);
  });

  it("emits turn_completed event with error message for failed turns", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    const state = makeState();

    // Override AFTER makeInput (which resets waitForTurnCompletion)
    vi.mocked(waitForTurnCompletion).mockResolvedValue(
      makeCompletedTurnResponse("failed", { message: "rate limit hit" }),
    );

    await executeTurns(input, state);

    const onEvent = input.runInput.onEvent as ReturnType<typeof vi.fn>;
    expect(onEvent).toHaveBeenCalled();
    const eventCall = onEvent.mock.calls[0][0];
    expect(eventCall.event).toBe("turn_completed");
    expect(eventCall.message).toBe("rate limit hit");
  });

  it("emits turn_completed event with fallback message for unknown status", async () => {
    // Issue inactive after first turn so the loop stops
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    // Override AFTER makeInput (which resets waitForTurnCompletion)
    // Status is not "completed" or "failed" or "interrupted" — falls through classifyTurnResult
    vi.mocked(waitForTurnCompletion).mockResolvedValue(makeCompletedTurnResponse("unknown_status", {}));

    await executeTurns(input, state);

    const onEvent = input.runInput.onEvent as ReturnType<typeof vi.fn>;
    const eventCall = onEvent.mock.calls[0][0];
    expect(eventCall.message).toContain("ended with status unknown_status");
  });

  it("emits turn_completed event with 'completed' message for successful turns", async () => {
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    const onEvent = input.runInput.onEvent as ReturnType<typeof vi.fn>;
    expect(onEvent).toHaveBeenCalled();
    const eventCall = onEvent.mock.calls[0][0];
    expect(eventCall.event).toBe("turn_completed");
    expect(eventCall.message).toContain("completed");
  });

  it("emits non-string error message as JSON in turn_completed event", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    const state = makeState();

    // Override AFTER makeInput (which resets waitForTurnCompletion)
    vi.mocked(waitForTurnCompletion).mockResolvedValue(
      makeCompletedTurnResponse("failed", { message: { code: 429, detail: "rate limited" } }),
    );

    await executeTurns(input, state);

    const onEvent = input.runInput.onEvent as ReturnType<typeof vi.fn>;
    const eventCall = onEvent.mock.calls[0][0];
    // Non-string message is JSON.stringified
    expect(eventCall.message).toContain("429");
    expect(eventCall.message).toContain("rate limited");
  });

  it("increments turnCount on each turn", async () => {
    // Run 3 turns, then issue becomes inactive
    vi.mocked(isActiveState).mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    expect(state.turnCount).toBe(3);
  });

  it("passes turnId from turn/start response to setActiveTurnId", async () => {
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    expect(input.setActiveTurnId).toHaveBeenCalledWith("turn-abc");
    expect(state.turnId).toBe("turn-abc");
  });

  it("throws when turn/start does not return a turnId", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput({ requestResult: {} });
    const state = makeState();

    const result = await executeTurns(input, state);

    // Should be caught and classified as a run error
    expect(result.kind).toBe("failed");
  });

  it("returns stop when tracker returns no issue", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);

    const input = makeInput();
    (input.tracker as { fetchIssueStatesByIds: ReturnType<typeof vi.fn> }).fetchIssueStatesByIds.mockResolvedValue([]);

    const state = makeState();
    const result = await executeTurns(input, state);

    expect(result.kind).toBe("normal");
    expect(state.turnCount).toBe(1);
  });

  it("passes model and effort from modelSelection to turn/start", async () => {
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    input.runInput.modelSelection = { model: "o3-mini", reasoningEffort: "low", source: "override" };
    const state = makeState();

    await executeTurns(input, state);

    const requestMock = (input.connection as { request: ReturnType<typeof vi.fn> }).request;
    const params = requestMock.mock.calls[0][1];
    expect(params.model).toBe("o3-mini");
    expect(params.effort).toBe("low");
  });

  it("passes title combining issue identifier and title to turn/start", async () => {
    vi.mocked(isActiveState).mockReturnValueOnce(false);

    const input = makeInput();
    const state = makeState();

    await executeTurns(input, state);

    const requestMock = (input.connection as { request: ReturnType<typeof vi.fn> }).request;
    const params = requestMock.mock.calls[0][1];
    expect(params.title).toBe("MT-1: Test");
  });

  it("decrements turnCount during compaction so failed turn does not consume budget", async () => {
    vi.mocked(isActiveState).mockReturnValue(true);
    vi.mocked(compactThread).mockResolvedValue(true);

    const input = makeInput({ maxTurns: 3 });
    const state = makeState();

    // Turn 1: context window exceeded → compaction → turnCount decremented
    // Turn 1 (retry): completed → issue inactive
    vi.mocked(waitForTurnCompletion)
      .mockResolvedValueOnce(makeCompletedTurnResponse("failed", { message: "context window exceeded" }))
      .mockResolvedValueOnce(makeCompletedTurnResponse())
      .mockResolvedValueOnce(makeCompletedTurnResponse());

    vi.mocked(isActiveState).mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = await executeTurns(input, state);

    // turnCount should be 3: one failed (decremented), then 3 successful
    expect(result.kind).toBe("normal");
    // The failed turn was decremented, so effectively: 1 (fail) - 1 (decrement) + 1 (retry) + 1 + 1 = 3
    expect(state.turnCount).toBe(3);
  });
});
