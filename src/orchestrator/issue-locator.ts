import { buildRunningIssueView, buildRetryIssueView } from "./snapshot-builder.js";
import type { ModelSelection, RuntimeIssueView } from "../core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";

export type IssueLocation =
  | { kind: "running"; entry: RunningEntry }
  | { kind: "retry"; entry: RetryRuntimeEntry }
  | { kind: "completed"; view: RuntimeIssueView }
  | { kind: "detail"; view: RuntimeIssueView };

export interface IssueLocatorCallbacks {
  getRunningEntries: () => Map<string, RunningEntry>;
  getRetryEntries: () => Map<string, RetryRuntimeEntry>;
  getCompletedViews: () => Map<string, RuntimeIssueView>;
  getDetailViews: () => Map<string, RuntimeIssueView>;
  resolveModelSelection: (identifier: string) => ModelSelection;
}

/**
 * Resolves an issue identifier to its authoritative runtime location.
 * Single point of resolution — callers use the returned location instead of
 * re-searching multiple state maps.
 */
export function resolveIssue(identifier: string, callbacks: IssueLocatorCallbacks): IssueLocation | null {
  const runningEntry = [...callbacks.getRunningEntries().values()].find(
    (entry) => entry.issue.identifier === identifier,
  );
  if (runningEntry) {
    return { kind: "running", entry: runningEntry };
  }

  const retryEntry = [...callbacks.getRetryEntries().values()].find((entry) => entry.identifier === identifier);
  if (retryEntry) {
    return { kind: "retry", entry: retryEntry };
  }

  const completedView = callbacks.getCompletedViews().get(identifier);
  if (completedView) {
    return { kind: "completed", view: completedView };
  }

  const detailView = callbacks.getDetailViews().get(identifier);
  if (detailView) {
    return { kind: "detail", view: detailView };
  }

  return null;
}

/**
 * Converts an IssueLocation to a RuntimeIssueView.
 */
export function toIssueView(location: IssueLocation, callbacks: IssueLocatorCallbacks): RuntimeIssueView {
  switch (location.kind) {
    case "running":
      return buildRunningIssueView(location.entry, callbacks.resolveModelSelection);
    case "retry":
      return buildRetryIssueView(location.entry, callbacks.resolveModelSelection);
    case "completed":
    case "detail":
      return location.view;
  }
}
