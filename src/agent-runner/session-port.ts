import type { PrecomputedRuntimeConfig } from "./docker-session.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import type { StopSignal } from "../core/signal-detection.js";
import type { Issue, ModelSelection, RunOutcome, Workspace } from "../core/types.js";
import type { SelfReviewResult } from "./self-review.js";

export interface AgentSessionStartInput {
  issue: Issue;
  modelSelection: ModelSelection;
  workspace: Workspace;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  precomputedRuntimeConfig?: PrecomputedRuntimeConfig;
}

export interface AgentSessionInitializeInput {
  issue: Issue;
  attempt: number | null;
  modelSelection: ModelSelection;
  workspace: Workspace;
  promptTemplate: string;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  previousThreadId?: string | null;
  previousPrFeedback?: string | null;
}

export interface AgentSessionInitializeSuccess {
  threadId: string;
  prompt: string;
}

export type AgentSessionInitializeResult = RunOutcome | AgentSessionInitializeSuccess;

export interface AgentSessionExecuteInput {
  issue: Issue;
  attempt: number | null;
  modelSelection: ModelSelection;
  workspace: Workspace;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  prompt: string;
  getLastAgentMessageContent?: () => string | null;
  getLastStopSignal?: () => StopSignal | null;
}

export interface AgentSession {
  initialize(input: AgentSessionInitializeInput): Promise<AgentSessionInitializeResult>;
  execute(input: AgentSessionExecuteInput): Promise<RunOutcome>;
  review(threadId: string, signal: AbortSignal, timeoutMs: number): Promise<SelfReviewResult | null>;
  steer(message: string): Promise<boolean>;
  shutdown(signal: AbortSignal): Promise<void>;
  getThreadId(): string | null;
  getFatalFailure(): { code: string; message: string } | null;
}

export interface AgentSessionPort {
  start(input: AgentSessionStartInput): Promise<AgentSession>;
}
