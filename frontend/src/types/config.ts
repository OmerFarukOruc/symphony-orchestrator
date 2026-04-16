export interface RuntimeInfo {
  version: string;
  data_dir: string;
  provider_summary: string;
}

// WHY divergent from src/prompt/types.ts and src/audit/types.ts: the frontend and
// backend are separate build targets that cannot share imports. PromptTemplate and
// AuditRecord are small interfaces (5-6 fields each) whose shapes are governed by
// the camelCase wire format returned by /api/v1/templates and /api/v1/audit.
// AGENTS.md explicitly allows duplicating small interfaces across the boundary.
export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditRecord {
  id: number;
  tableName: string;
  key: string;
  path: string | null;
  operation: string;
  previousValue: string | null;
  newValue: string | null;
  actor: string;
  requestId: string | null;
  timestamp: string;
}

/** Lightweight payload from SSE audit.mutation events (no old/new values). */
export interface AuditMutationEvent {
  tableName: string;
  key: string;
  path: string | null;
  operation: string;
  actor: string;
  timestamp: string;
}

export interface TrackedPrRecord {
  issueId: string;
  url: string;
  number: number;
  repo: string;
  branchName: string;
  status: "open" | "merged" | "closed";
  mergedAt: string | null;
  mergeCommitSha: string | null;
  createdAt: string;
  updatedAt: string;
}
