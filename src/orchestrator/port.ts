import type { ModelSelection, ReasoningEffort, RuntimeSnapshot } from "../core/types.js";
import type { AttemptDetailView, IssueDetailView } from "./snapshot-builder.js";
import type { RecoveryReport } from "./recovery-types.js";

export interface RefreshCommand {
  type: "refresh";
  reason: string;
  issueId?: string;
  issueIdentifier?: string;
}

export interface AbortIssueCommand {
  type: "abort_issue";
  identifier: string;
}

export interface UpdateIssueModelSelectionCommand {
  type: "update_issue_model_selection";
  identifier: string;
  model: string;
  reasoningEffort: ReasoningEffort | null;
}

export interface SetIssueTemplateOverrideCommand {
  type: "set_issue_template_override";
  identifier: string;
  templateId: string;
}

export interface ClearIssueTemplateOverrideCommand {
  type: "clear_issue_template_override";
  identifier: string;
}

export interface SteerIssueCommand {
  type: "steer_issue";
  identifier: string;
  message: string;
}

export type OrchestratorCommand =
  | RefreshCommand
  | AbortIssueCommand
  | UpdateIssueModelSelectionCommand
  | SetIssueTemplateOverrideCommand
  | ClearIssueTemplateOverrideCommand
  | SteerIssueCommand;

export interface RefreshCommandResult {
  queued: boolean;
  coalesced: boolean;
  requestedAt: string;
  targeted: boolean;
  issueId?: string;
  issueIdentifier?: string;
}

export type AbortIssueResult =
  | { ok: true; alreadyStopping: boolean; requestedAt: string }
  | { ok: false; code: "not_found" | "conflict"; message: string };

export type UpdateIssueModelSelectionResult = {
  updated: boolean;
  restarted: boolean;
  appliesNextAttempt: boolean;
  selection: ModelSelection;
} | null;

export type SetIssueTemplateOverrideResult = { updated: true; appliesNextAttempt: true } | null;
export type ClearIssueTemplateOverrideResult = { cleared: true } | null;
export type SteerIssueResult = { ok: boolean } | null;

export interface OrchestratorPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  executeCommand(command: RefreshCommand): Promise<RefreshCommandResult>;
  executeCommand(command: AbortIssueCommand): Promise<AbortIssueResult>;
  executeCommand(command: UpdateIssueModelSelectionCommand): Promise<UpdateIssueModelSelectionResult>;
  executeCommand(command: SetIssueTemplateOverrideCommand): Promise<SetIssueTemplateOverrideResult>;
  executeCommand(command: ClearIssueTemplateOverrideCommand): Promise<ClearIssueTemplateOverrideResult>;
  executeCommand(command: SteerIssueCommand): Promise<SteerIssueResult>;
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
  abortIssue(identifier: string): AbortIssueResult;
  updateIssueModelSelection(input: {
    identifier: string;
    model: string;
    reasoningEffort: ReasoningEffort | null;
  }): Promise<UpdateIssueModelSelectionResult>;
  steerIssue(identifier: string, message: string): Promise<SteerIssueResult>;
  getTemplateOverride(identifier: string): string | null;
  updateIssueTemplateOverride(identifier: string, templateId: string): boolean;
  clearIssueTemplateOverride(identifier: string): boolean;
}
