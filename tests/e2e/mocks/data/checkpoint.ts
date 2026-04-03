/**
 * Mock data factory for AttemptCheckpointRecord objects used in E2E API mock intercepts.
 *
 * Mirrors the shape returned by `GET /api/v1/attempts/:attempt_id/checkpoints`.
 */

export interface CheckpointTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CheckpointRecord {
  checkpointId: number;
  attemptId: string;
  ordinal: number;
  trigger: string;
  eventCursor: number | null;
  status: string;
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
  tokenUsage: CheckpointTokenUsage | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function buildCheckpointRecord(overrides?: Partial<CheckpointRecord>): CheckpointRecord {
  return {
    checkpointId: 1,
    attemptId: "att-001",
    ordinal: 0,
    trigger: "pr_merged",
    eventCursor: null,
    status: "completed",
    threadId: null,
    turnId: null,
    turnCount: 4,
    tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    metadata: { prUrl: "https://github.com/owner/repo/pull/42", mergeCommitSha: "abc123" },
    createdAt: "2026-04-03T10:00:00.000Z",
    ...overrides,
  };
}

export function buildStartCheckpoint(overrides?: Partial<CheckpointRecord>): CheckpointRecord {
  return buildCheckpointRecord({
    checkpointId: 1,
    ordinal: 0,
    trigger: "attempt_start",
    status: "running",
    tokenUsage: null,
    metadata: null,
    createdAt: "2026-04-01T09:00:00.000Z",
    ...overrides,
  });
}

export function buildMidRunCheckpoint(overrides?: Partial<CheckpointRecord>): CheckpointRecord {
  return buildCheckpointRecord({
    checkpointId: 2,
    ordinal: 1,
    trigger: "turn_complete",
    status: "running",
    turnCount: 2,
    tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
    metadata: null,
    createdAt: "2026-04-01T09:30:00.000Z",
    ...overrides,
  });
}
