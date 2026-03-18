import { failureOutcome } from "./abort-outcomes.js";
import { inspectOomKilled } from "../docker/lifecycle.js";
import type { AgentRunnerTurnExecutionInput, AgentRunnerTurnExecutionState } from "./turn-executor.types.js";
import type { RunOutcome } from "../core/types.js";

export async function classifyExitState(
  input: AgentRunnerTurnExecutionInput,
  state: AgentRunnerTurnExecutionState,
): Promise<RunOutcome> {
  const exitState = await Promise.race([
    state.exitPromise,
    new Promise<{ code: null; signal: null }>((resolve) => setTimeout(() => resolve({ code: null, signal: null }), 20)),
  ]);

  const fatalOutcome = failureOutcome(state.getFatalFailure(), state.threadId, state.turnId, state.turnCount);
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
