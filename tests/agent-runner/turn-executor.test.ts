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

import { executeTurns } from "../../src/agent-runner/turn-executor.js";
import { waitForTurnCompletion } from "../../src/agent-runner/turn-state.js";
import { isActiveState } from "../../src/state/policy.js";
import { failureOutcome, outcomeForAbort } from "../../src/agent-runner/abort-outcomes.js";
import { classifyExitState } from "../../src/agent-runner/exit-classifier.js";
import type {
  AgentRunnerTurnExecutionInput,
  AgentRunnerTurnExecutionState,
} from "../../src/agent-runner/turn-executor.types.js";
import type { ServiceConfig } from "../../src/core/types.js";

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
    linearClient: {
      fetchIssueStatesByIds: vi.fn().mockResolvedValue([{ id: "issue-1", identifier: "MT-1", state: "In Progress" }]),
    },
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
});
