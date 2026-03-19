import { describe, expect, it } from "vitest";

import { outcomeForAbort, classifyRunError, failureOutcome } from "../../src/agent-runner/abort-outcomes.js";
import { JsonRpcTimeoutError } from "../../src/agent/json-rpc-connection.js";

function makeSignal(reason?: string): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason);
  return controller.signal;
}

describe("outcomeForAbort", () => {
  it("returns stalled outcome for stalled reason", () => {
    const result = outcomeForAbort(makeSignal("stalled"), "t1", "turn-1", 3);
    expect(result.kind).toBe("stalled");
    expect(result.errorCode).toBe("stalled");
    expect(result.errorMessage).toBe("worker exceeded stall timeout");
    expect(result.threadId).toBe("t1");
    expect(result.turnId).toBe("turn-1");
    expect(result.turnCount).toBe(3);
  });

  it("returns cancelled/terminal for terminal reason", () => {
    const result = outcomeForAbort(makeSignal("terminal"), null, null, 0);
    expect(result.kind).toBe("cancelled");
    expect(result.errorCode).toBe("terminal");
    expect(result.errorMessage).toMatch(/terminal state/);
  });

  it("returns cancelled/inactive for inactive reason", () => {
    const result = outcomeForAbort(makeSignal("inactive"), null, null, 0);
    expect(result.kind).toBe("cancelled");
    expect(result.errorCode).toBe("inactive");
    expect(result.errorMessage).toMatch(/active state/);
  });

  it("returns cancelled/shutdown for shutdown reason", () => {
    const result = outcomeForAbort(makeSignal("shutdown"), null, null, 0);
    expect(result.kind).toBe("cancelled");
    expect(result.errorCode).toBe("shutdown");
    expect(result.errorMessage).toMatch(/shutdown/);
  });

  it("returns cancelled/model_override_updated for model change reason", () => {
    const result = outcomeForAbort(makeSignal("model_override_updated"), null, null, 0);
    expect(result.kind).toBe("cancelled");
    expect(result.errorCode).toBe("model_override_updated");
    expect(result.errorMessage).toMatch(/model/);
  });

  it("falls back to generic cancelled for unknown reason", () => {
    const result = outcomeForAbort(makeSignal("something_unknown"), null, null, 0);
    expect(result.kind).toBe("cancelled");
    expect(result.errorCode).toBe("cancelled");
    expect(result.errorMessage).toBe("worker cancelled");
  });

  it("falls back to generic cancelled when signal has no reason", () => {
    const result = outcomeForAbort(makeSignal(undefined), "t2", "turn-2", 5);
    expect(result.kind).toBe("cancelled");
    expect(result.errorCode).toBe("cancelled");
  });
});

describe("classifyRunError", () => {
  it("classifies JsonRpcTimeoutError as timed_out", () => {
    const error = new JsonRpcTimeoutError("request timed out");
    const result = classifyRunError(error, "t1", "turn-1", 2);
    expect(result.kind).toBe("timed_out");
    expect(result.errorCode).toBe("read_timeout");
    expect(result.threadId).toBe("t1");
  });

  it("classifies turn completion timeout with turn_timeout code", () => {
    const error = new Error("turn completion timed out after 30s");
    const result = classifyRunError(error, null, null, 0);
    expect(result.kind).toBe("timed_out");
    expect(result.errorCode).toBe("turn_timeout");
  });

  it("classifies other timed out messages as read_timeout", () => {
    const error = new Error("connection timed out");
    const result = classifyRunError(error, null, null, 0);
    expect(result.kind).toBe("timed_out");
    expect(result.errorCode).toBe("read_timeout");
  });

  it("classifies connection exited as port_exit", () => {
    const error = new Error("connection exited unexpectedly");
    const result = classifyRunError(error, "t1", "turn-1", 1);
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("port_exit");
  });

  it("classifies startup readiness failure as startup_timeout", () => {
    const error = new Error("startup readiness check failed");
    const result = classifyRunError(error, null, null, 0);
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("startup_timeout");
  });

  it("classifies unknown errors as startup_failed", () => {
    const error = new Error("something went very wrong");
    const result = classifyRunError(error, null, null, 0);
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("startup_failed");
  });

  it("handles non-Error objects", () => {
    const result = classifyRunError("a plain string error", null, null, 0);
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("startup_failed");
    expect(result.errorMessage).toBe("a plain string error");
  });
});

describe("failureOutcome", () => {
  it("returns null when failure is null", () => {
    expect(failureOutcome(null, "t1", "turn-1", 2)).toBe(null);
  });

  it("returns a failed outcome when failure is provided", () => {
    const failure = { code: "mcp_error", message: "MCP startup failed" };
    const result = failureOutcome(failure, "t1", "turn-1", 2);
    expect(result).not.toBe(null);
    expect(result?.kind).toBe("failed");
    expect(result?.errorCode).toBe("mcp_error");
    expect(result?.errorMessage).toBe("MCP startup failed");
    expect(result?.threadId).toBe("t1");
    expect(result?.turnId).toBe("turn-1");
    expect(result?.turnCount).toBe(2);
  });
});
