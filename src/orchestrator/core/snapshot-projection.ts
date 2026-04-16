import { issueView } from "../views.js";
import type { ModelSelection, ReasoningEffort, RuntimeIssueView, Workspace } from "../../core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "../runtime-types.js";
import type { Issue } from "../../core/types.js";

export interface ModelViewFields {
  configuredModel: string;
  configuredReasoningEffort: ReasoningEffort | null;
  configuredModelSource: "default" | "override";
  model: string;
  reasoningEffort: ReasoningEffort | null;
  modelSource: "default" | "override";
  modelChangePending: boolean;
}

export function projectModelViewFields(
  configuredSelection: ModelSelection,
  activeModel: { model: string; reasoningEffort: ReasoningEffort | null; source: "default" | "override" },
): ModelViewFields {
  return {
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    model: activeModel.model,
    reasoningEffort: activeModel.reasoningEffort,
    modelSource: activeModel.source,
    modelChangePending:
      configuredSelection.model !== activeModel.model ||
      configuredSelection.reasoningEffort !== activeModel.reasoningEffort,
  };
}

export function projectRunningIssueView(
  entry: RunningEntry,
  resolveModelSelection: (identifier: string) => ModelSelection,
): RuntimeIssueView {
  const configuredSelection = resolveModelSelection(entry.issue.identifier);
  const action = entry.status === "stopping" ? "stopping" : "running";

  return issueView(entry.issue, {
    workspaceKey: entry.workspace.workspaceKey,
    workspacePath: entry.workspace.path,
    status: entry.status,
    attempt: entry.attempt,
    message: `${action} in ${entry.workspace.path}`,
    startedAt: new Date(entry.startedAtMs).toISOString(),
    lastEventAt: new Date(entry.lastEventAtMs).toISOString(),
    tokenUsage: entry.tokenUsage,
    priority: entry.issue.priority,
    labels: entry.issue.labels,
    ...projectModelViewFields(configuredSelection, entry.modelSelection),
  });
}

export function projectRetryIssueView(
  entry: RetryRuntimeEntry,
  resolveModelSelection: (identifier: string) => ModelSelection,
): RuntimeIssueView {
  const configuredSelection = resolveModelSelection(entry.identifier);
  const nextRetryDueAt = new Date(entry.dueAtMs).toISOString();

  return issueView(entry.issue, {
    ...projectModelViewFields(configuredSelection, {
      model: configuredSelection.model,
      reasoningEffort: configuredSelection.reasoningEffort,
      source: configuredSelection.source,
    }),
    modelChangePending: false,
    workspaceKey: entry.workspaceKey,
    status: "retrying",
    attempt: entry.attempt,
    error: entry.error,
    message: `retry due at ${nextRetryDueAt}`,
    nextRetryDueAt,
  });
}

export function projectOutcomeIssueView(
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
  const lastEventIso = new Date(entry.lastEventAtMs).toISOString();

  return issueView(issue, {
    workspaceKey: workspace.workspaceKey,
    workspacePath: workspace.path,
    status: overrides.status,
    attempt: overrides.attempt,
    error: overrides.error,
    message: overrides.message,
    startedAt: new Date(entry.startedAtMs).toISOString(),
    updatedAt: lastEventIso,
    lastEventAt: lastEventIso,
    tokenUsage: entry.tokenUsage,
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending: false,
    model: entry.modelSelection.model,
    reasoningEffort: entry.modelSelection.reasoningEffort,
    modelSource: entry.modelSelection.source,
    pullRequestUrl: overrides.pullRequestUrl,
  });
}

export function projectCompletedViewsForSnapshot(
  completedViews: Iterable<RuntimeIssueView>,
  limit = 25,
): RuntimeIssueView[] {
  return [...completedViews]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, limit);
}
