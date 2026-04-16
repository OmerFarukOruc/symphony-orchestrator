import type { ModelSelection, RuntimeIssueView } from "../core/types.js";
import { projectRetryIssueView, projectRunningIssueView } from "./core/snapshot-projection.js";
import type { RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";

/** Converts a RunningEntry to a RuntimeIssueView. */
export function buildRunningIssueView(
  entry: RunningEntry,
  resolveModelSelection: (identifier: string) => ModelSelection,
): RuntimeIssueView {
  return projectRunningIssueView(entry, resolveModelSelection);
}

/** Converts a RetryRuntimeEntry to a RuntimeIssueView. */
export function buildRetryIssueView(
  entry: RetryRuntimeEntry,
  resolveModelSelection: (identifier: string) => ModelSelection,
): RuntimeIssueView {
  return projectRetryIssueView(entry, resolveModelSelection);
}
