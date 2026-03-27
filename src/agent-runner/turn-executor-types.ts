import type { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import type { TrackerPort } from "../tracker/port.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import type { ModelSelection, RunOutcome, ServiceConfig, SymphonyLogger, Workspace, Issue } from "../core/types.js";
import type { TurnState } from "./turn-state.js";

/** Explicit result type for turn execution - no implicit undefined sentinel. */
export type TurnResult =
  | { kind: "stop" } // Issue inactive, stop the turn loop
  | { kind: "continue" } // Continue to next turn
  | { kind: "compact_needed" } // Context window exceeded — compact and retry
  | { kind: "outcome"; outcome: RunOutcome }; // Terminal outcome

export interface AgentRunnerTurnExecutionRunInput {
  issue: Issue;
  attempt: number | null;
  modelSelection: ModelSelection;
  workspace: Workspace;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
}

export interface AgentRunnerTurnExecutionInput {
  connection: JsonRpcConnection;
  config: ServiceConfig;
  prompt: string;
  runInput: AgentRunnerTurnExecutionRunInput;
  turnState: TurnState;
  tracker: TrackerPort;
  setActiveTurnId: (turnId: string | null) => void;
  /** Returns the latest agent message content for early stop-signal detection between turns. */
  getLastAgentMessageContent?: () => string | null;
  /** Logger for turn-level diagnostics (e.g. thread compaction). */
  logger?: SymphonyLogger;
}

export interface AgentRunnerTurnExecutionState {
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
  containerName: string | null;
  exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  getFatalFailure: () => { code: string; message: string } | null;
}
