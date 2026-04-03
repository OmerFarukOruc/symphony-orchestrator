import type { ModelSelection, ReasoningEffort, RuntimeSnapshot } from "../core/types.js";
import type { AttemptDetailView, IssueDetailView } from "./snapshot-builder.js";
import type { RecoveryReport } from "./recovery-types.js";

export interface OrchestratorPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  requestRefresh(reason: string): { queued: boolean; coalesced: boolean; requestedAt: string };
  /** Request a targeted refresh for a specific issue (lower latency than full poll). */
  requestTargetedRefresh(issueId: string, issueIdentifier: string, reason: string): void;
  /** Stop a running worker for an issue (e.g., when webhook shows issue moved to Done). */
  stopWorkerForIssue(issueIdentifier: string, reason: string): void;
  getSnapshot(): RuntimeSnapshot;
  getRecoveryReport(): RecoveryReport | null;
  getSerializedState(): Record<string, unknown>;
  getIssueDetail(identifier: string): IssueDetailView | null;
  getAttemptDetail(attemptId: string): AttemptDetailView | null;
  abortIssue(
    identifier: string,
  ):
    | { ok: true; alreadyStopping: boolean; requestedAt: string }
    | { ok: false; code: "not_found" | "conflict"; message: string };
  updateIssueModelSelection(input: {
    identifier: string;
    model: string;
    reasoningEffort: ReasoningEffort | null;
  }): Promise<{ updated: boolean; restarted: boolean; appliesNextAttempt: boolean; selection: ModelSelection } | null>;
  steerIssue(identifier: string, message: string): Promise<{ ok: boolean } | null>;
  getTemplateOverride(identifier: string): string | null;
  updateIssueTemplateOverride(identifier: string, templateId: string): boolean;
  clearIssueTemplateOverride(identifier: string): boolean;
}
