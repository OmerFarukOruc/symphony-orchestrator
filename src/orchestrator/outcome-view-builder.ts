import { issueView } from "./views.js";
import type { RunningEntry } from "./runtime-types.js";
import type { Issue, ModelSelection, Workspace } from "../core/types.js";

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
  },
): ReturnType<typeof issueView> {
  return issueView(issue, {
    workspaceKey: workspace.workspaceKey,
    workspacePath: workspace.path,
    status: overrides.status,
    attempt: overrides.attempt,
    error: overrides.error,
    message: overrides.message,
    startedAt: new Date(entry.startedAtMs).toISOString(),
    tokenUsage: entry.tokenUsage,
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending: false,
    model: entry.modelSelection.model,
    reasoningEffort: entry.modelSelection.reasoningEffort,
    modelSource: entry.modelSelection.source,
  });
}
