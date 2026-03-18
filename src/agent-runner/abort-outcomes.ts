import { JsonRpcTimeoutError } from "../agent/json-rpc-connection.js";
import type { RunOutcome } from "../core/types.js";

const ABORT_REASONS: Record<string, { kind: RunOutcome["kind"]; errorCode: string; errorMessage: string }> = {
  stalled: { kind: "stalled", errorCode: "stalled", errorMessage: "worker exceeded stall timeout" },
  terminal: {
    kind: "cancelled",
    errorCode: "terminal",
    errorMessage: "worker stopped because the issue reached a terminal state",
  },
  inactive: {
    kind: "cancelled",
    errorCode: "inactive",
    errorMessage: "worker stopped because the issue is no longer in an active state",
  },
  shutdown: { kind: "cancelled", errorCode: "shutdown", errorMessage: "worker cancelled during service shutdown" },
  model_override_updated: {
    kind: "cancelled",
    errorCode: "model_override_updated",
    errorMessage: "worker cancelled to apply updated model settings",
  },
};

export function outcomeForAbort(
  signal: AbortSignal,
  threadId: string | null,
  turnId: string | null,
  turnCount: number,
): RunOutcome {
  const reason = ABORT_REASONS[signal.reason as string];
  return {
    kind: reason?.kind ?? "cancelled",
    errorCode: reason?.errorCode ?? "cancelled",
    errorMessage: reason?.errorMessage ?? "worker cancelled",
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
