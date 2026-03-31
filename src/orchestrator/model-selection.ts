import type { ModelSelection, ReasoningEffort, RecentEvent, ServiceConfig } from "../core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";
import { type IssueLocatorCallbacks, resolveIssue } from "./issue-locator.js";
import type { IssueDetailView } from "./snapshot-builder.js";
import type { IssueConfigStore } from "../persistence/sqlite/issue-config-store.js";

export function resolveModelSelection(
  overrides: Map<string, Omit<ModelSelection, "source">>,
  config: ServiceConfig,
  identifier: string,
): ModelSelection {
  const override = overrides.get(identifier);
  if (override) {
    return {
      model: override.model,
      reasoningEffort: override.reasoningEffort,
      source: "override",
    };
  }

  return {
    model: config.codex.model,
    reasoningEffort: config.codex.reasoningEffort,
    source: "default",
  };
}

export async function updateIssueModelSelection(
  ctx: {
    getConfig: () => ServiceConfig;
    getIssueDetail: (identifier: string) => IssueDetailView | null;
    issueModelOverrides: Map<string, Omit<ModelSelection, "source">>;
    runningEntries: Map<string, RunningEntry>;
    retryEntries: Map<string, RetryRuntimeEntry>;
    pushEvent: (event: RecentEvent) => void;
    requestRefresh: (reason: string) => { queued: boolean; coalesced: boolean; requestedAt: string };
    issueConfigStore: IssueConfigStore;
  },
  input: {
    identifier: string;
    model: string;
    reasoningEffort: ReasoningEffort | null;
  },
): Promise<{ updated: boolean; restarted: boolean; appliesNextAttempt: boolean; selection: ModelSelection } | null> {
  const identifier = input.identifier;
  const existingDetail = ctx.getIssueDetail(identifier);
  if (!existingDetail) {
    return null;
  }

  ctx.issueModelOverrides.set(identifier, {
    model: input.model,
    reasoningEffort: input.reasoningEffort,
  });
  ctx.issueConfigStore.upsertModel(identifier, input.model, input.reasoningEffort);

  const selection = resolveModelSelection(ctx.issueModelOverrides, ctx.getConfig(), identifier);
  const effortSuffix = selection.reasoningEffort ? ` (${selection.reasoningEffort})` : "";

  // Use locator to find running or retry entry
  const locatorCallbacks: IssueLocatorCallbacks = {
    getRunningEntries: () => ctx.runningEntries,
    getRetryEntries: () => ctx.retryEntries,
    getCompletedViews: () => new Map(),
    getDetailViews: () => new Map(),
    resolveModelSelection: (id) => resolveModelSelection(ctx.issueModelOverrides, ctx.getConfig(), id),
  };
  const location = resolveIssue(identifier, locatorCallbacks);

  if (location?.kind === "running" && !location.entry.abortController.signal.aborted) {
    ctx.pushEvent({
      at: new Date().toISOString(),
      issueId: location.entry.issue.id,
      issueIdentifier: location.entry.issue.identifier,
      sessionId: location.entry.sessionId,
      event: "model_selection_updated",
      message: `next run model updated to ${selection.model}${effortSuffix}`,
    });
    return {
      updated: true,
      restarted: false,
      appliesNextAttempt: true,
      selection,
    };
  }

  if (location?.kind === "retry") {
    ctx.pushEvent({
      at: new Date().toISOString(),
      issueId: location.entry.issue.id,
      issueIdentifier: location.entry.issue.identifier,
      sessionId: null,
      event: "model_selection_updated",
      message: `next run model updated to ${selection.model}${effortSuffix}`,
    });
    return {
      updated: true,
      restarted: false,
      appliesNextAttempt: true,
      selection,
    };
  }

  ctx.requestRefresh("model_selection_updated");
  return {
    updated: true,
    restarted: false,
    appliesNextAttempt: false,
    selection,
  };
}
