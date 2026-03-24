import type { Issue } from "../core/types.js";
import type { RuntimeEventSink } from "./lifecycle-events.js";
import { nowIso } from "./views.js";
import type { RunningEntry } from "./runtime-types.js";
import { TokenRefreshError } from "../codex/token-refresh.js";

/** Context required by the worker-failure handler. */
export interface WorkerFailureContext {
  runningEntries: Map<string, RunningEntry>;
  releaseIssueClaim: (issueId: string) => void;
  pushEvent: RuntimeEventSink;
  deps: {
    attemptStore: { updateAttempt: (attemptId: string, patch: Record<string, unknown>) => Promise<void> };
    logger: { warn: (meta: Record<string, unknown>, message: string) => void };
  };
}

export async function handleWorkerFailure(
  ctx: WorkerFailureContext,
  issue: Issue,
  entry: RunningEntry,
  error: unknown,
): Promise<void> {
  try {
    await entry.flushPersistence();
  } catch (flushError) {
    ctx.deps.logger.warn(
      { issue_id: issue.id, issue_identifier: issue.identifier, attempt_id: entry.runId, error: String(flushError) },
      "worker failure: failed to flush persistence, attempting fallback update",
    );
    try {
      await ctx.deps.attemptStore.updateAttempt(entry.runId, { errorCode: "flush_failed" });
    } catch (fallbackError) {
      ctx.deps.logger.warn(
        {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          attempt_id: entry.runId,
          error: String(fallbackError),
        },
        "worker failure: fallback attempt update also failed",
      );
    }
  }

  ctx.runningEntries.delete(issue.id);
  ctx.releaseIssueClaim(issue.id);
  ctx.pushEvent({
    at: nowIso(),
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    sessionId: entry.sessionId,
    event: "worker_failed",
    message: String(error),
  });

  const errorCode = error instanceof TokenRefreshError ? error.code : "worker_failed";

  try {
    await ctx.deps.attemptStore.updateAttempt(entry.runId, {
      status: "failed",
      endedAt: nowIso(),
      errorCode,
      errorMessage: String(error),
      tokenUsage: entry.tokenUsage,
      threadId: null,
    });
  } catch (updateError) {
    ctx.deps.logger.warn(
      {
        issue_id: issue.id,
        issue_identifier: issue.identifier,
        attempt_id: entry.runId,
        error: String(updateError),
      },
      "worker failure: failed to update attempt status, attempting fallback error code",
    );
    try {
      await ctx.deps.attemptStore.updateAttempt(entry.runId, { errorCode: "update_failed" });
    } catch (fallbackError) {
      ctx.deps.logger.warn(
        {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          attempt_id: entry.runId,
          error: String(fallbackError),
        },
        "worker failure: fallback error code update also failed",
      );
    }
  }
}
