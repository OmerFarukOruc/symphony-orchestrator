import type { AttemptRecord } from "../core/types.js";

export type RecoveryAction = "resume" | "cleanup" | "escalate" | "skip";

export interface RecoveryAssessment {
  attemptId: string;
  issueId: string;
  issueIdentifier: string;
  persistedStatus: AttemptRecord["status"];
  attemptNumber: number | null;
  threadId: string | null;
  workspacePath: string | null;
  workspaceExists: boolean;
  workerAlive: boolean;
  containerNames: string[];
  action: RecoveryAction;
  reason: string;
}

export interface RecoveryResult extends RecoveryAssessment {
  success: boolean;
  autoCommitSha: string | null;
  workspacePreserved: boolean;
  error: string | null;
}

export interface RecoveryReport {
  generatedAt: string;
  dryRun: boolean;
  totalScanned: number;
  resumed: string[];
  cleanedUp: string[];
  escalated: string[];
  skipped: string[];
  errors: Array<{ attemptId: string; issueIdentifier: string; error: string }>;
  results: RecoveryResult[];
  durationMs: number;
}
