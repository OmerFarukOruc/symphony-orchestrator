import { issueView } from "./views.js";
import type { ModelSelection, ReasoningEffort, RuntimeIssueView } from "../core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";

interface ModelViewFields {
  configuredModel: string;
  configuredReasoningEffort: ReasoningEffort | null;
  configuredModelSource: "default" | "override";
  model: string;
  reasoningEffort: ReasoningEffort | null;
  modelSource: "default" | "override";
  modelChangePending: boolean;
}

/** Builds common model translation fields for a RuntimeIssueView. */
function buildModelViewFields(
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

/** Converts a RunningEntry to a RuntimeIssueView. */
export function buildRunningIssueView(
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
    ...buildModelViewFields(configuredSelection, entry.modelSelection),
  });
}

/** Converts a RetryRuntimeEntry to a RuntimeIssueView. */
export function buildRetryIssueView(
  entry: RetryRuntimeEntry,
  resolveModelSelection: (identifier: string) => ModelSelection,
): RuntimeIssueView {
  const configuredSelection = resolveModelSelection(entry.identifier);
  const nextRetryDueAt = new Date(entry.dueAtMs).toISOString();
  return issueView(entry.issue, {
    ...buildModelViewFields(configuredSelection, {
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
