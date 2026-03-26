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

export function issueRef(issue: Issue) {
  return { id: issue.id, identifier: issue.identifier, title: issue.title, state: issue.state, url: issue.url };
}

export function outcomeToStatus(kind: RunOutcome["kind"]): string {
  const statusMap: Record<RunOutcome["kind"], string> = {
    normal: "completed",
    timed_out: "timed_out",
    stalled: "stalled",
    cancelled: "cancelled",
    failed: "failed",
  };
  return statusMap[kind];
}
