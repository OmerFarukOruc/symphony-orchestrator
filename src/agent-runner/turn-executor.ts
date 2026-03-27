import {
  asRecord,
  asString,
  extractRateLimits,
  extractTokenUsageSnapshot,
  extractTurnId,
  getTurnSandboxPolicy,
} from "./helpers.js";
import { classifyRunError, failureOutcome, outcomeForAbort } from "./abort-outcomes.js";
import { extractCodexErrorInfo } from "./error-classifier.js";
import { classifyExitState } from "./exit-classifier.js";
import { composeSessionId, waitForTurnCompletion } from "./turn-state.js";
import { detectStopSignal } from "../core/signal-detection.js";
import { isActiveState } from "../state/policy.js";
import { sanitizeContent } from "../core/content-sanitizer.js";
import type {
  AgentRunnerTurnExecutionInput,
  AgentRunnerTurnExecutionState,
  TurnResult,
} from "./turn-executor-types.js";
import type { RunOutcome } from "../core/types.js";

const CONTINUATION_PROMPT =
  "Continue the current issue, make concrete progress, and stop only when done or blocked. When the issue is complete, end your final message with `SYMPHONY_STATUS: DONE`. If you are blocked and cannot proceed, end your final message with `SYMPHONY_STATUS: BLOCKED`.";

const STRUCTURED_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["DONE", "BLOCKED", "CONTINUE"] },
    summary: { type: "string" },
  },
  required: ["status", "summary"],
} as const;

function checkFatalFailure(state: AgentRunnerTurnExecutionState): RunOutcome | null {
  return failureOutcome(state.getFatalFailure(), state.threadId, state.turnId, state.turnCount);
}

function classifyTurnResult(
  completedStatus: string,
  completedError: Record<string, unknown>,
  state: AgentRunnerTurnExecutionState,
): RunOutcome | null {
  if (completedStatus === "failed") {
    const codexErrorInfo = extractCodexErrorInfo(completedError);
    return {
      kind: "failed",
      errorCode: "turn_failed",
      errorMessage: asString(completedError.message) ?? "turn failed",
      codexErrorInfo,
      threadId: state.threadId,
      turnId: state.turnId,
      turnCount: state.turnCount,
    };
  }
  if (completedStatus === "interrupted") {
    return {
      kind: "cancelled",
      errorCode: "interrupted",
      errorMessage: asString(completedError.message) ?? "turn interrupted",
      threadId: state.threadId,
      turnId: state.turnId,
      turnCount: state.turnCount,
    };
  }
  return null;
}

function emitTurnCompletedEvent(
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
  completedStatus: string,
  completedError: Record<string, unknown>,
  completedUsage: ReturnType<typeof extractTokenUsageSnapshot>,
  turnResult: unknown,
): void {
  let rawMessage: string;
  if (completedStatus === "completed") {
    rawMessage = `turn ${state.turnCount} completed`;
  } else if (completedError.message) {
    rawMessage =
      typeof completedError.message === "string" ? completedError.message : JSON.stringify(completedError.message);
  } else {
    rawMessage = `turn ${state.turnCount} ended with status ${completedStatus}`;
  }

  input.runInput.onEvent({
    at: new Date().toISOString(),
    issueId: input.runInput.issue.id,
    issueIdentifier: input.runInput.issue.identifier,
    sessionId: composeSessionId(state.threadId, state.turnId),
    event: "turn_completed",
    message: sanitizeContent(rawMessage) || `turn ${state.turnCount} ended with status ${completedStatus}`,
    usage: completedUsage ?? undefined,
    rateLimits: extractRateLimits(turnResult) ?? undefined,
  });
}

async function runSingleTurn(
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
  prompt: string,
): Promise<TurnResult> {
  state.turnCount += 1;
  const turnResult = await input.connection.request("turn/start", {
    threadId: state.threadId,
    cwd: input.runInput.workspace.path,
    title: `${input.runInput.issue.identifier}: ${input.runInput.issue.title}`,
    model: input.runInput.modelSelection.model,
    effort: input.runInput.modelSelection.reasoningEffort,
    approvalPolicy: input.config.codex.approvalPolicy,
    sandboxPolicy: getTurnSandboxPolicy(input.config, input.runInput.workspace.path),
    summary: "concise",
    input: [{ type: "text", text: prompt }],
    ...(input.config.codex.structuredOutput ? { outputSchema: STRUCTURED_OUTPUT_SCHEMA } : {}),
  });
  state.turnId = extractTurnId(turnResult);
  if (!state.turnId) {
    throw new Error("turn/start did not return a turn identifier");
  }
  input.setActiveTurnId(state.turnId);

  const completedTurn = await waitForTurnCompletion(input.turnState, {
    turnId: state.turnId,
    signal: input.runInput.signal,
    timeoutMs: input.config.codex.turnTimeoutMs,
  });

  const completedTurnRecord = asRecord(asRecord(completedTurn).turn);
  const completedStatus = asString(completedTurnRecord.status) ?? "failed";
  const completedError = asRecord(completedTurnRecord.error);
  const completedUsage = resolveTokenUsage(completedTurnRecord, completedTurn, turnResult);

  emitTurnCompletedEvent(input, state, completedStatus, completedError, completedUsage, turnResult);

  const fatalOutcome = checkFatalFailure(state);
  if (fatalOutcome) return { kind: "outcome", outcome: fatalOutcome };

  const turnOutcome = classifyTurnResult(completedStatus, completedError, state);
  if (turnOutcome) return { kind: "outcome", outcome: turnOutcome };

  const latestIssue = (await input.tracker.fetchIssueStatesByIds([input.runInput.issue.id]))[0];
  if (!latestIssue || !isActiveState(latestIssue.state, input.config)) return { kind: "stop" };
  return { kind: "continue" };
}

function resolveTokenUsage(
  turnRecord: Record<string, unknown>,
  completedTurn: unknown,
  turnResult: unknown,
): ReturnType<typeof extractTokenUsageSnapshot> {
  return (
    extractTokenUsageSnapshot(turnRecord.usage) ??
    extractTokenUsageSnapshot(turnRecord.tokenUsage) ??
    extractTokenUsageSnapshot(asRecord(completedTurn).usage) ??
    extractTokenUsageSnapshot(asRecord(completedTurn).tokenUsage) ??
    extractTokenUsageSnapshot(asRecord(turnResult).usage) ??
    extractTokenUsageSnapshot(asRecord(turnResult).tokenUsage)
  );
}

function checkAbort(input: AgentRunnerTurnExecutionInput, state: AgentRunnerTurnExecutionState): RunOutcome | null {
  if (input.runInput.signal.aborted) {
    return outcomeForAbort(input.runInput.signal, state.threadId, state.turnId, state.turnCount);
  }
  return null;
}

async function handleTurnLoop(
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
): Promise<RunOutcome | null> {
  while (state.turnCount < input.config.agent.maxTurns) {
    const abortOutcome = checkAbort(input, state);
    if (abortOutcome) return abortOutcome;

    const prompt = state.turnCount === 0 ? input.prompt : CONTINUATION_PROMPT;
    const result = await runSingleTurn(input, state, prompt);
    if (result.kind === "stop") return null;
    if (result.kind === "outcome") return result.outcome;

    const lastContent = input.getLastAgentMessageContent?.() ?? null;
    if (detectStopSignal(lastContent)) return null;
  }
  return null;
}

function handleExecutionError(
  error: unknown,
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
): RunOutcome {
  const fatalOutcome = checkFatalFailure(state);
  if (fatalOutcome) return fatalOutcome;

  if (input.runInput.signal.aborted) {
    return outcomeForAbort(input.runInput.signal, state.threadId, state.turnId, state.turnCount);
  }
  return classifyRunError(error, state.threadId, state.turnId, state.turnCount);
}

export async function executeTurns(
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
): Promise<RunOutcome> {
  try {
    const loopOutcome = await handleTurnLoop(input, state);
    return loopOutcome ?? classifyExitState(input, state);
  } catch (error) {
    return handleExecutionError(error, input, state);
  }
}
