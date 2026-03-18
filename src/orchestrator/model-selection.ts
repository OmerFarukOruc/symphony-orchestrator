import type { ModelSelection, ReasoningEffort, RecentEvent, ServiceConfig } from "../core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";

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
    getIssueDetail: (identifier: string) => Record<string, unknown> | null;
    issueModelOverrides: Map<string, Omit<ModelSelection, "source">>;
    runningEntries: Map<string, RunningEntry>;
    retryEntries: Map<string, RetryRuntimeEntry>;
    pushEvent: (event: RecentEvent) => void;
    requestRefresh: (reason: string) => { queued: boolean; coalesced: boolean; requestedAt: string };
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

  const selection = resolveModelSelection(ctx.issueModelOverrides, ctx.getConfig(), identifier);
  const runningEntry = [...ctx.runningEntries.values()].find((entry) => entry.issue.identifier === identifier);
  const effortSuffix = selection.reasoningEffort ? ` (${selection.reasoningEffort})` : "";
  if (runningEntry && !runningEntry.abortController.signal.aborted) {
    ctx.pushEvent({
      at: new Date().toISOString(),
      issueId: runningEntry.issue.id,
      issueIdentifier: runningEntry.issue.identifier,
      sessionId: runningEntry.sessionId,
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

  const retryEntry = [...ctx.retryEntries.values()].find((entry) => entry.identifier === identifier);
  if (retryEntry) {
    ctx.pushEvent({
      at: new Date().toISOString(),
      issueId: retryEntry.issue.id,
      issueIdentifier: retryEntry.issue.identifier,
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
