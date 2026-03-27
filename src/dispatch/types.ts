import type { AgentRunnerEventHandler } from "../agent-runner/contracts.js";
import type {
  Issue,
  ModelSelection,
  RecentEvent,
  RunOutcome,
  ServiceConfig,
  TokenUsageSnapshot,
  Workspace,
} from "../core/types.js";

/**
 * Pre-computed Codex runtime config for data plane dispatch.
 * Avoids reading auth.json from disk by providing values pre-computed by control plane.
 */
export interface PrecomputedRuntimeConfig {
  configToml: string;
  authJsonBase64: string | null;
}

/**
 * Interface for the runAttempt dispatcher.
 * Both AgentRunner (local) and DispatchClient (remote) implement this.
 */
export interface RunAttemptDispatcher {
  runAttempt(input: {
    issue: Issue;
    attempt: number | null;
    modelSelection: ModelSelection;
    promptTemplate: string;
    workspace: Workspace;
    signal: AbortSignal;
    onEvent: AgentRunnerEventHandler;
    /** Thread ID from a previous attempt — enables thread/resume on retry. */
    previousThreadId?: string | null;
  }): Promise<RunOutcome>;
}

/**
 * Request payload sent from control plane to data plane.
 * Contains everything the data plane needs to run an attempt,
 * pre-materialized by the control plane.
 */
export interface DispatchRequest {
  issue: Issue;
  attempt: number | null;
  modelSelection: ModelSelection;
  promptTemplate: string;
  workspace: Workspace;
  /** Full config snapshot (workflow + overlay + secrets) */
  config: ServiceConfig;
  /** Pre-computed Codex TOML config (avoids data plane reading auth.json) */
  codexRuntimeConfigToml: string;
  /** Pre-computed auth.json content as base64 (null if no auth file) */
  codexRuntimeAuthJsonBase64: string | null;
  /** Env var names required by providers (for data plane validation) */
  codexRequiredEnvNames: string[];
}

/**
 * Event payload streamed from data plane to control plane.
 * Matches AgentRunnerEventHandler's parameter type exactly.
 */
export type DispatchEvent = RecentEvent & {
  usage?: TokenUsageSnapshot;
  usageMode?: "absolute_total" | "delta";
  rateLimits?: unknown;
  content?: string | null;
};

/**
 * SSE message types for the dispatch stream.
 * The data plane responds with a text/event-stream where each message
 * is one of these types. The final message is always "outcome".
 */
export type DispatchStreamMessage =
  | { type: "event"; payload: DispatchEvent }
  | { type: "outcome"; payload: RunOutcome };

/**
 * Health check response from the data plane.
 */
export interface DataPlaneHealth {
  status: "ok" | "draining";
  activeDispatches: number;
}
