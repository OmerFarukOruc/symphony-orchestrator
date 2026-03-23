export interface AttemptSummary {
  attemptId: string;
  attemptNumber: number;
  startedAt: string | null;
  endedAt: string | null;
  status: string;
  model: string | null;
  reasoningEffort: string | null;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AttemptRecord extends AttemptSummary {
  issueIdentifier?: string;
  title?: string;
  workspacePath?: string | null;
  workspaceKey?: string | null;
  modelSource?: string;
  turnCount?: number;
  threadId?: string | null;
  turnId?: string | null;
  events?: unknown[];
}

export function buildAttemptSummary(overrides?: Partial<AttemptSummary>): AttemptSummary {
  return {
    attemptId: "att-001",
    attemptNumber: 1,
    startedAt: "2026-01-15T11:00:00.000Z",
    endedAt: null,
    status: "running",
    model: "o3-mini",
    reasoningEffort: "medium",
    tokenUsage: { inputTokens: 5000, outputTokens: 3000, totalTokens: 8000 },
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

export function buildAttemptRecord(overrides?: Partial<AttemptRecord>): AttemptRecord {
  return {
    ...buildAttemptSummary(),
    issueIdentifier: "SYM-42",
    title: "Fix authentication bug",
    workspacePath: "/tmp/workspace/sym-42",
    workspaceKey: "ws-001",
    modelSource: "config",
    turnCount: 5,
    threadId: "thread-001",
    turnId: "turn-005",
    events: [
      {
        at: "2026-01-15T11:30:00.000Z",
        issue_id: "issue-001",
        issue_identifier: "SYM-42",
        session_id: "sess-001",
        event: "tool_call",
        message: "Called write_file",
        content: null,
      },
    ],
    ...overrides,
  };
}
