import type { RunningEntry } from "./runtime-types.js";
import type { Issue, ModelSelection, RuntimeIssueView, Workspace } from "../core/types.js";
import { projectOutcomeIssueView } from "./core/snapshot-projection.js";

export interface OutcomeViewInput {
  issue: Issue;
  workspace: Workspace;
  entry: RunningEntry;
  configuredSelection: ModelSelection;
  overrides: {
    status: string;
    attempt?: number | null;
    error?: string | null;
    message?: string | null;
    pullRequestUrl?: string | null;
  };
}

export function buildOutcomeView(
  issue: Issue,
  workspace: Workspace,
  entry: RunningEntry,
  configuredSelection: ModelSelection,
  overrides: {
    status: string;
    attempt?: number | null;
    error?: string | null;
    message?: string | null;
    pullRequestUrl?: string | null;
  },
): RuntimeIssueView {
  return projectOutcomeIssueView(issue, workspace, entry, configuredSelection, overrides);
}
