import type { PrecomputedRuntimeConfig } from "./docker-session.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import type { StopSignal } from "../core/signal-detection.js";
import type { Issue, ModelSelection, RunOutcome, Workspace } from "../core/types.js";
import type { SelfReviewResult } from "./self-review.js";

export interface RuntimeStartInput {
  issue: Issue;
  modelSelection: ModelSelection;
  workspace: Workspace;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  precomputedRuntimeConfig?: PrecomputedRuntimeConfig;
}

export interface RuntimeInitInput {
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

export interface RuntimeInitSuccess {
  threadId: string;
  prompt: string;
}

export type RuntimeInitResult = RunOutcome | RuntimeInitSuccess;

export interface RuntimeExecuteInput {
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

export interface CodexRuntimeSession {
  initialize(input: RuntimeInitInput): Promise<RuntimeInitResult>;
  execute(input: RuntimeExecuteInput): Promise<RunOutcome>;
  review(threadId: string, signal: AbortSignal, timeoutMs: number): Promise<SelfReviewResult | null>;
  steer(message: string): Promise<boolean>;
  shutdown(signal: AbortSignal): Promise<void>;
  getThreadId(): string | null;
  getFatalFailure(): { code: string; message: string } | null;
}

export interface CodexRuntimePort {
  start(input: RuntimeStartInput): Promise<CodexRuntimeSession>;
}
