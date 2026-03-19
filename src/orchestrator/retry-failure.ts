import { randomUUID } from "node:crypto";

import { AttemptStore } from "../core/attempt-store.js";
import { issueView, nowIso } from "./views.js";
import type { Issue, ModelSelection, RecentEvent, AttemptRecord } from "../core/types.js";
import type { RunningEntry } from "./runtime-types.js";

function buildRetryFailureView(
  ctx: {
    detailViews: Map<string, ReturnType<typeof issueView>>;
    resolveModelSelection: (identifier: string) => ModelSelection;
  },
  issue: Issue,
  runningEntry: RunningEntry | null,
  errorText: string,
  attempt: number,
): ReturnType<typeof issueView> {
  const selection = runningEntry?.modelSelection ?? ctx.resolveModelSelection(issue.identifier);
  const configuredSelection = ctx.resolveModelSelection(issue.identifier);
  const workspaceKey =
    runningEntry?.workspace.workspaceKey ?? ctx.detailViews.get(issue.identifier)?.workspaceKey ?? null;

  return issueView(issue, {
    workspaceKey,
    status: "failed",
    attempt,
    error: errorText,
    message: `retry startup failed: ${errorText}`,
    configuredModel: configuredSelection.model,
    configuredReasoningEffort: configuredSelection.reasoningEffort,
    configuredModelSource: configuredSelection.source,
    modelChangePending: false,
    model: selection.model,
    reasoningEffort: selection.reasoningEffort,
    modelSource: selection.source,
  });
}

function buildFailureAttemptData(
  runningEntry: RunningEntry | null,
  issue: Issue,
  selection: ModelSelection,
  errorText: string,
  attempt: number,
  workspaceKey: string | null,
  endedAt: string,
): AttemptRecord {
  return {
    attemptId: runningEntry?.runId ?? randomUUID(),
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    title: issue.title,
    workspaceKey,
    workspacePath: runningEntry?.workspace.path ?? null,
    status: "failed",
    attemptNumber: attempt,
    startedAt: runningEntry ? new Date(runningEntry.startedAtMs).toISOString() : endedAt,
    endedAt,
    model: selection.model,
    reasoningEffort: selection.reasoningEffort,
    modelSource: selection.source,
    threadId: runningEntry?.sessionId ?? null,
    turnId: null,
    turnCount: 0,
    errorCode: "worker_failed",
    errorMessage: errorText,
    tokenUsage: runningEntry?.tokenUsage ?? null,
  };
}

async function persistRetryFailure(
  attemptStore: Pick<AttemptStore, "updateAttempt" | "createAttempt">,
  runningEntry: RunningEntry | null,
  issue: Issue,
  selection: ModelSelection,
  errorText: string,
  attempt: number,
  workspaceKey: string | null,
): Promise<void> {
  const endedAt = nowIso();
  const attemptId = runningEntry?.runId ?? randomUUID();

  let persisted = false;
  if (runningEntry) {
    persisted = await attemptStore
      .updateAttempt(attemptId, {
        status: "failed" as const,
        endedAt,
        errorCode: "worker_failed",
        errorMessage: errorText,
        tokenUsage: runningEntry.tokenUsage ?? null,
        threadId: runningEntry.sessionId ?? null,
      })
      .then(() => true)
      .catch(() => false);
  }

  if (!persisted) {
    const data = buildFailureAttemptData(runningEntry, issue, selection, errorText, attempt, workspaceKey, endedAt);
    await attemptStore.createAttempt(data).catch(() => undefined);
  }
}

export async function handleRetryLaunchFailure(
  ctx: {
    runningEntries: Map<string, RunningEntry>;
    clearRetryEntry: (issueId: string) => void;
    deps: {
      attemptStore: Pick<AttemptStore, "updateAttempt" | "createAttempt">;
      logger: { error: (meta: Record<string, unknown>, message: string) => void };
    };
    detailViews: Map<string, ReturnType<typeof issueView>>;
    completedViews: Map<string, ReturnType<typeof issueView>>;
    pushEvent: (event: RecentEvent) => void;
    resolveModelSelection: (identifier: string) => ModelSelection;
  },
  issue: Issue,
  attempt: number,
  error: unknown,
): Promise<void> {
  const runningEntry = ctx.runningEntries.get(issue.id) ?? null;
  ctx.runningEntries.delete(issue.id);
  ctx.clearRetryEntry(issue.id);

  const errorText = String(error);
  const message = `retry startup failed: ${errorText}`;

  ctx.deps.logger.error(
    { issue_id: issue.id, issue_identifier: issue.identifier, error: errorText },
    "retry-launched worker startup failed",
  );
  ctx.pushEvent({
    at: nowIso(),
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    sessionId: runningEntry?.sessionId ?? null,
    event: "worker_failed",
    message,
  });

  const failureView = buildRetryFailureView(ctx, issue, runningEntry, errorText, attempt);
  ctx.detailViews.set(issue.identifier, failureView);
  ctx.completedViews.set(issue.identifier, failureView);

  const selection = runningEntry?.modelSelection ?? ctx.resolveModelSelection(issue.identifier);
  await persistRetryFailure(
    ctx.deps.attemptStore,
    runningEntry,
    issue,
    selection,
    errorText,
    attempt,
    failureView.workspaceKey ?? null,
  );
}
