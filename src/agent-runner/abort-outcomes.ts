import { JsonRpcTimeoutError } from "../agent/json-rpc-connection.js";
import type { RunOutcome } from "../core/types.js";

export function outcomeForAbort(
  signal: AbortSignal,
  threadId: string | null,
  turnId: string | null,
  turnCount: number,
): RunOutcome {
  if (signal.reason === "stalled") {
    return {
      kind: "stalled",
      errorCode: "stalled",
      errorMessage: "worker exceeded stall timeout",
      threadId,
      turnId,
      turnCount,
    };
  }
  if (signal.reason === "terminal") {
    return {
      kind: "cancelled",
      errorCode: "terminal",
      errorMessage: "worker stopped because the issue reached a terminal state",
      threadId,
      turnId,
      turnCount,
    };
  }
  if (signal.reason === "inactive") {
    return {
      kind: "cancelled",
      errorCode: "inactive",
      errorMessage: "worker stopped because the issue is no longer in an active state",
      threadId,
      turnId,
      turnCount,
    };
  }
  if (signal.reason === "shutdown") {
    return {
      kind: "cancelled",
      errorCode: "shutdown",
      errorMessage: "worker cancelled during service shutdown",
      threadId,
      turnId,
      turnCount,
    };
  }
  if (signal.reason === "model_override_updated") {
    return {
      kind: "cancelled",
      errorCode: "model_override_updated",
      errorMessage: "worker cancelled to apply updated model settings",
      threadId,
      turnId,
      turnCount,
    };
  }
  return {
    kind: "cancelled",
    errorCode: "cancelled",
    errorMessage: "worker cancelled",
    threadId,
    turnId,
    turnCount,
  };
}

export function classifyRunError(
  error: unknown,
  threadId: string | null,
  turnId: string | null,
  turnCount: number,
): RunOutcome {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof JsonRpcTimeoutError || message.includes("timed out")) {
    const timeoutCode = message.includes("turn completion") ? "turn_timeout" : "read_timeout";
    return { kind: "timed_out", errorCode: timeoutCode, errorMessage: message, threadId, turnId, turnCount };
  }
  if (message.includes("connection exited")) {
    return { kind: "failed", errorCode: "port_exit", errorMessage: message, threadId, turnId, turnCount };
  }
  if (message.includes("startup readiness")) {
    return { kind: "failed", errorCode: "startup_timeout", errorMessage: message, threadId, turnId, turnCount };
  }
  return { kind: "failed", errorCode: "startup_failed", errorMessage: message, threadId, turnId, turnCount };
}

export function failureOutcome(
  failure: { code: string; message: string } | null,
  threadId: string | null,
  turnId: string | null,
  turnCount: number,
): RunOutcome | null {
  if (!failure) {
    return null;
  }
  return {
    kind: "failed",
    errorCode: failure.code,
    errorMessage: failure.message,
    threadId,
    turnId,
    turnCount,
  };
}
