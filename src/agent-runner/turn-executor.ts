import {
  asRecord,
  asString,
  extractRateLimits,
  extractTokenUsageSnapshot,
  extractTurnId,
  getTurnSandboxPolicy,
} from "./helpers.js";
import { classifyRunError, failureOutcome, outcomeForAbort } from "./abort-outcomes.js";
import { composeSessionId, waitForTurnCompletion } from "./turn-state.js";
import { isActiveState } from "../state/policy.js";
import { sanitizeContent } from "../core/content-sanitizer.js";
import { inspectOomKilled } from "../docker/lifecycle.js";
import type { AgentRunnerTurnExecutionInput, AgentRunnerTurnExecutionState } from "./turn-executor.types.js";
import type { RunOutcome } from "../core/types.js";

const CONTINUATION_PROMPT =
  "Continue the current issue, make concrete progress, and stop only when done or blocked. When the issue is complete, end your final message with `SYMPHONY_STATUS: DONE`. If you are blocked and cannot proceed, end your final message with `SYMPHONY_STATUS: BLOCKED`.";

function checkFatalFailure(state: AgentRunnerTurnExecutionState): RunOutcome | null {
  return failureOutcome(state.getFatalFailure(), state.threadId, state.turnId, state.turnCount);
}

function classifyTurnResult(
  completedStatus: string,
  completedError: Record<string, unknown>,
  state: AgentRunnerTurnExecutionState,
): RunOutcome | null {
  if (completedStatus === "failed") {
    return {
      kind: "failed",
      errorCode: "turn_failed",
      errorMessage: asString(completedError.message) ?? "turn failed",
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
  input.runInput.onEvent({
    at: new Date().toISOString(),
    issueId: input.runInput.issue.id,
    issueIdentifier: input.runInput.issue.identifier,
    sessionId: composeSessionId(state.threadId, state.turnId),
    event: "turn_completed",
    message:
      sanitizeContent(
        completedStatus === "completed"
          ? `turn ${state.turnCount} completed`
          : completedError.message
            ? String(completedError.message)
            : `turn ${state.turnCount} ended with status ${completedStatus}`,
      ) || `turn ${state.turnCount} ended with status ${completedStatus}`,
    usage: completedUsage ?? undefined,
    rateLimits: extractRateLimits(turnResult) ?? undefined,
  });
}

async function classifyExitState(
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
): Promise<RunOutcome> {
  const exitState = await Promise.race([
    state.exitPromise,
    new Promise<{ code: null; signal: null }>((resolve) => setTimeout(() => resolve({ code: null, signal: null }), 20)),
  ]);

  const fatalOutcome = checkFatalFailure(state);
  if (fatalOutcome) {
    return fatalOutcome;
  }

  if (exitState.code !== null && !input.runInput.signal.aborted) {
    if (state.containerName && exitState.code === 137) {
      const oomKilled = await inspectOomKilled(state.containerName);
      if (oomKilled) {
        return {
          kind: "failed",
          errorCode: "container_oom",
          errorMessage: `container OOM-killed (memory limit: ${input.config.codex.sandbox.resources.memory})`,
          threadId: state.threadId,
          turnId: state.turnId,
          turnCount: state.turnCount,
        };
      }
    }
    return {
      kind: "failed",
      errorCode: "port_exit",
      errorMessage: `codex subprocess exited with code ${exitState.code}`,
      threadId: state.threadId,
      turnId: state.turnId,
      turnCount: state.turnCount,
    };
  }

  return {
    kind: "normal",
    errorCode: null,
    errorMessage: null,
    threadId: state.threadId,
    turnId: state.turnId,
    turnCount: state.turnCount,
  };
}

async function runSingleTurn(
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
  prompt: string,
): Promise<RunOutcome | null> {
  state.turnCount += 1;
  const turnResult = await input.connection.request("turn/start", {
    threadId: state.threadId,
    cwd: input.runInput.workspace.path,
    title: `${input.runInput.issue.identifier}: ${input.runInput.issue.title}`,
    model: input.runInput.modelSelection.model,
    effort: input.runInput.modelSelection.reasoningEffort,
    approvalPolicy: input.config.codex.approvalPolicy,
    sandboxPolicy: getTurnSandboxPolicy(input.config, input.runInput.workspace.path),
    input: [{ type: "text", text: prompt }],
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
  const completedUsage =
    extractTokenUsageSnapshot(completedTurnRecord.usage) ??
    extractTokenUsageSnapshot(completedTurnRecord.tokenUsage) ??
    extractTokenUsageSnapshot(asRecord(completedTurn).usage) ??
    extractTokenUsageSnapshot(asRecord(completedTurn).tokenUsage) ??
    extractTokenUsageSnapshot(asRecord(turnResult).usage) ??
    extractTokenUsageSnapshot(asRecord(turnResult).tokenUsage);

  emitTurnCompletedEvent(input, state, completedStatus, completedError, completedUsage, turnResult);

  const fatalOutcome = checkFatalFailure(state);
  if (fatalOutcome) {
    return fatalOutcome;
  }

  const turnOutcome = classifyTurnResult(completedStatus, completedError, state);
  if (turnOutcome) {
    return turnOutcome;
  }

  const latestIssue = (await input.linearClient.fetchIssueStatesByIds([input.runInput.issue.id]))[0];
  if (!latestIssue || !isActiveState(latestIssue.state, input.config)) {
    return null; // break out of loop
  }
  return undefined as unknown as RunOutcome; // continue to next turn (sentinel)
}

export async function executeTurns(
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
): Promise<RunOutcome> {
  try {
    while (state.turnCount < input.config.agent.maxTurns) {
      if (input.runInput.signal.aborted) {
        return outcomeForAbort(input.runInput.signal, state.threadId, state.turnId, state.turnCount);
      }

      const prompt = state.turnCount === 0 ? input.prompt : CONTINUATION_PROMPT;
      const result = await runSingleTurn(input, state, prompt);
      if (result === null) {
        break; // issue inactive, stop
      }
      if (result !== undefined) {
        return result; // terminal outcome
      }
      // else: continue to next turn
    }

    return classifyExitState(input, state);
  } catch (error) {
    const fatalOutcome = checkFatalFailure(state);
    if (fatalOutcome) {
      return fatalOutcome;
    }
    if (input.runInput.signal.aborted) {
      return outcomeForAbort(input.runInput.signal, state.threadId, state.turnId, state.turnCount);
    }
    return classifyRunError(error, state.threadId, state.turnId, state.turnCount);
  }
}
