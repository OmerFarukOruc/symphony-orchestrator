import type { TokenUsageSnapshot, ReasoningEffort } from "./model.js";

export interface RunOutcome {
  kind: "normal" | "failed" | "timed_out" | "stalled" | "cancelled";
  errorCode: string | null;
  errorMessage: string | null;
  codexErrorInfo?: { type: string; message: string; retryAfterMs?: number } | null;
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
}

export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
  timer: NodeJS.Timeout | null;
  /** Thread ID from the previous attempt — enables thread/resume on retry. */
  threadId?: string | null;
  /** Aggregated review feedback from the previous PR — injected into the agent prompt on retry. */
  previousPrFeedback?: string | null;
}

export interface RecentEvent {
  at: string;
  issueId: string | null;
  issueIdentifier: string | null;
  sessionId: string | null;
  event: string;
  message: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AttemptRecord {
  attemptId: string;
  issueId: string;
  issueIdentifier: string;
  title: string;
  workspaceKey: string | null;
  workspacePath: string | null;
  status: "running" | "completed" | "failed" | "timed_out" | "stalled" | "cancelled" | "paused";
  attemptNumber: number | null;
  startedAt: string;
  endedAt: string | null;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  modelSource: "default" | "override";
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  tokenUsage: TokenUsageSnapshot | null;
  pullRequestUrl?: string | null;
  stopSignal?: "done" | "blocked" | null;
  /** Agent-authored markdown summary of PR changes (3–8 bullets). Null when generation failed or skipped. */
  summary?: string | null;
}

export interface AttemptEvent extends RecentEvent {
  attemptId: string;
  usage?: TokenUsageSnapshot | null;
  rateLimits?: unknown;
  content?: string | null;
}

/**
 * The event that triggered a checkpoint write.
 * - `attempt_created` — first checkpoint: written when the attempt row is persisted.
 * - `cursor_advanced` — thread or turn cursor advanced (new `attempt_events` rows).
 * - `status_transition` — attempt status changed (e.g. running → completed).
 * - `terminal_completion` — attempt reached a terminal state (completed/failed/cancelled).
 * - `pr_merged` — PR was merged; archive-on-merge triggered.
 */
export type CheckpointTrigger =
  | "attempt_created"
  | "cursor_advanced"
  | "status_transition"
  | "terminal_completion"
  | "pr_merged";

/**
 * A single entry in the per-attempt checkpoint history.
 * Checkpoints are append-only and ordered by `ordinal` (ascending).
 * `eventCursor` is a loose integer high-water mark referencing
 * the highest `attempt_events.id` value at the time of the write.
 */
export interface AttemptCheckpointRecord {
  checkpointId: number;
  attemptId: string;
  ordinal: number;
  trigger: CheckpointTrigger;
  eventCursor: number | null;
  status: AttemptRecord["status"];
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
  tokenUsage: TokenUsageSnapshot | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
