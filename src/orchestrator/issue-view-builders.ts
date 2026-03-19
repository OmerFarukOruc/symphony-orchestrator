import { issueView } from "./views.js";
import type { ModelSelection, RuntimeIssueView } from "../core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";

/** Converts a RunningEntry to a RuntimeIssueView. */
export function buildRunningIssueView(
  entry: RunningEntry,
  resolveModelSelection: (identifier: string) => ModelSelection,
): RuntimeIssueView {
  const configuredSelection = resolveModelSelection(entry.issue.identifier);
  return issueView(entry.issue, {
    workspaceKey: entry.workspace.workspaceKey,
    workspacePath: entry.workspace.path,
    status: entry.status,
    attempt: entry.attempt,
    message: `running in ${entry.workspace.path}`,
    startedAt: new Date(entry.startedAtMs).toISOString(),
    lastEventAt: new Date(entry.lastEventAtMs).toISOString(),
    tokenUsage: entry.tokenUsage,
    priority: entry.issue.priority,
    labels: entry.issue.labels,
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending:
      configuredSelection.model !== entry.modelSelection.model ||
      configuredSelection.reasoningEffort !== entry.modelSelection.reasoningEffort,
    model: entry.modelSelection.model,
    reasoningEffort: entry.modelSelection.reasoningEffort,
    modelSource: entry.modelSelection.source,
  });
}

/** Converts a RetryRuntimeEntry to a RuntimeIssueView. */
export function buildRetryIssueView(
  entry: RetryRuntimeEntry,
  resolveModelSelection: (identifier: string) => ModelSelection,
): RuntimeIssueView {
  const configuredSelection = resolveModelSelection(entry.identifier);
  return issueView(entry.issue, {
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending: false,
    workspaceKey: entry.workspaceKey,
    status: "retrying",
    attempt: entry.attempt,
    error: entry.error,
    message: `retry due at ${new Date(entry.dueAtMs).toISOString()}`,
    model: configuredSelection.model,
    reasoningEffort: configuredSelection.reasoningEffort,
    modelSource: configuredSelection.source,
  });
}
