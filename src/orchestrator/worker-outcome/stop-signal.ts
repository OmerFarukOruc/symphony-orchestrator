import type { OutcomeContext } from "../context.js";
import type { Issue, Workspace, ModelSelection } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import type { StopSignal } from "../../core/signal-detection.js";
import { buildOutcomeView } from "../outcome-view-builder.js";
import { nowIso } from "../views.js";
import { executeGitPostRun } from "../git-post-run.js";
import { issueRef } from "./types.js";
import { writeCompletionWriteback } from "./completion-writeback.js";

export async function handleStopSignal(
  ctx: OutcomeContext,
  stopSignal: StopSignal,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
): Promise<void> {
  let pullRequestUrl: string | null = null;
  const status = stopSignal === "blocked" ? "paused" : "completed";
  if (stopSignal === "done" && entry.repoMatch && ctx.deps.gitManager) {
    try {
      const result = await executeGitPostRun(ctx.deps.gitManager, workspace, issue, entry.repoMatch);
      pullRequestUrl = result.pullRequestUrl;
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      ctx.deps.logger.info(
        { issue_identifier: issue.identifier, error: errorText },
        "git post-run failed after DONE — completing issue anyway",
      );
    }
  }

  await ctx.deps.attemptStore.updateAttempt(entry.runId, { stopSignal, pullRequestUrl, status }).catch((error) => {
    ctx.deps.logger.info(
      { attempt_id: entry.runId, error: String(error) },
      "attempt update failed after stop signal (non-fatal)",
    );
  });

  if (pullRequestUrl) {
    ctx.deps.logger.info({ issue_identifier: issue.identifier, url: pullRequestUrl }, "pull request created");
  }

  const isBlocked = stopSignal === "blocked";
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
      status,
      attempt,
      message: isBlocked ? "worker reported issue blocked" : "worker reported issue complete",
    }),
  );
  ctx.notify({
    type: isBlocked ? "worker_failed" : "worker_completed",
    severity: isBlocked ? "critical" : "info",
    timestamp: nowIso(),
    message: isBlocked ? "worker reported issue blocked" : "worker reported issue complete",
    issue: issueRef(issue),
    attempt,
    metadata: { workspace: workspace.path, pullRequestUrl },
  });
  // DONE keeps the claim sticky until terminal; BLOCKED releases it for a later retry.
  if (isBlocked) {
    ctx.releaseIssueClaim(issue.id);
  }

  // Write completion back to tracker (non-blocking).
  void writeCompletionWriteback(ctx, { issue, entry, attempt, stopSignal, pullRequestUrl });
}
