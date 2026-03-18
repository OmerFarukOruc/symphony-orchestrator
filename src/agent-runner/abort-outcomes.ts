import type { RunOutcome } from "../types.js";

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
