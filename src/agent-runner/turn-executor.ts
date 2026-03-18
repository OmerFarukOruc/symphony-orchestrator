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

export async function executeTurns(
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
): Promise<RunOutcome> {
  const { config, connection, prompt, runInput, turnState } = input;

  try {
    while (state.turnCount < config.agent.maxTurns) {
      if (runInput.signal.aborted) {
        return outcomeForAbort(runInput.signal, state.threadId, state.turnId, state.turnCount);
      }

      state.turnCount += 1;
      const turnResult = await connection.request("turn/start", {
        threadId: state.threadId,
        cwd: runInput.workspace.path,
        title: `${runInput.issue.identifier}: ${runInput.issue.title}`,
        model: runInput.modelSelection.model,
        effort: runInput.modelSelection.reasoningEffort,
        approvalPolicy: config.codex.approvalPolicy,
        sandboxPolicy: getTurnSandboxPolicy(config, runInput.workspace.path),
        input: [
          {
            type: "text",
            text: state.turnCount === 1 ? prompt : CONTINUATION_PROMPT,
          },
        ],
      });
      state.turnId = extractTurnId(turnResult);
      if (!state.turnId) {
        throw new Error("turn/start did not return a turn identifier");
      }
      input.setActiveTurnId(state.turnId);

      const completedTurn = await waitForTurnCompletion(turnState, {
        turnId: state.turnId,
        signal: runInput.signal,
        timeoutMs: config.codex.turnTimeoutMs,
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

      runInput.onEvent({
        at: new Date().toISOString(),
        issueId: runInput.issue.id,
        issueIdentifier: runInput.issue.identifier,
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

      {
        const maybeFailureOutcome = failureOutcome(
          state.getFatalFailure(),
          state.threadId,
          state.turnId,
          state.turnCount,
        );
        if (maybeFailureOutcome) {
          return maybeFailureOutcome;
        }
      }

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

      const latestIssue = (await input.linearClient.fetchIssueStatesByIds([runInput.issue.id]))[0];
      if (!latestIssue || !isActiveState(latestIssue.state, config)) {
        break;
      }
    }

    const exitState = await Promise.race([
      state.exitPromise,
      new Promise<{ code: null; signal: null }>((resolve) =>
        setTimeout(() => resolve({ code: null, signal: null }), 20),
      ),
    ]);
    {
      const maybeFailureOutcome = failureOutcome(
        state.getFatalFailure(),
        state.threadId,
        state.turnId,
        state.turnCount,
      );
      if (maybeFailureOutcome) {
        return maybeFailureOutcome;
      }
    }
    if (exitState.code !== null && !runInput.signal.aborted) {
      if (state.containerName && exitState.code === 137) {
        const oomKilled = await inspectOomKilled(state.containerName);
        if (oomKilled) {
          return {
            kind: "failed",
            errorCode: "container_oom",
            errorMessage: `container OOM-killed (memory limit: ${config.codex.sandbox.resources.memory})`,
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
  } catch (error) {
    {
      const maybeFailureOutcome = failureOutcome(
        state.getFatalFailure(),
        state.threadId,
        state.turnId,
        state.turnCount,
      );
      if (maybeFailureOutcome) {
        return maybeFailureOutcome;
      }
    }
    if (runInput.signal.aborted) {
      return outcomeForAbort(runInput.signal, state.threadId, state.turnId, state.turnCount);
    }
    return classifyRunError(error, state.threadId, state.turnId, state.turnCount);
  }
}
