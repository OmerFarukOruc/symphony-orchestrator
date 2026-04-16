import type { Issue, ModelSelection, RunOutcome, Workspace } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";

export interface WorkerOutcomeInput {
  outcome: RunOutcome;
  entry: RunningEntry;
  issue: Issue;
  workspace: Workspace;
  attempt: number | null;
}

export interface PreparedWorkerOutcome extends WorkerOutcomeInput {
  latestIssue: Issue;
  modelSelection: ModelSelection;
}

export type TerminalPathKind =
  | "service_stopped"
  | "terminal_cleanup"
  | "inactive_issue"
  | "operator_abort"
  | "cancelled_or_hard_failure";

export function issueRef(issue: Issue) {
  return { id: issue.id, identifier: issue.identifier, title: issue.title, state: issue.state, url: issue.url };
}

const STATUS_MAP: Record<RunOutcome["kind"], string> = {
  normal: "completed",
  timed_out: "timed_out",
  stalled: "stalled",
  cancelled: "cancelled",
  failed: "failed",
};

export function outcomeToStatus(kind: RunOutcome["kind"]): string {
  return STATUS_MAP[kind];
}
