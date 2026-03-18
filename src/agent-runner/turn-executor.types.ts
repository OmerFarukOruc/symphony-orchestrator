import type { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import type { LinearClient } from "../linear/client.js";
import type { AgentRunnerEventHandler } from "./index.js";
import type { ModelSelection, ServiceConfig, Workspace, Issue } from "../core/types.js";
import type { TurnState } from "./turn-state.js";

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
  linearClient: LinearClient;
  setActiveTurnId: (turnId: string | null) => void;
}

export interface AgentRunnerTurnExecutionState {
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
  containerName: string | null;
  exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  getFatalFailure: () => { code: string; message: string } | null;
}
