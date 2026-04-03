import type { OutcomeContext } from "../context.js";
import type { Issue, Workspace, ModelSelection } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import type { StopSignal } from "../../core/signal-detection.js";
import { buildOutcomeView } from "../outcome-view-builder.js";
import { nowIso } from "../views.js";
import { executeGitPostRun } from "../git-post-run.js";
import { issueRef } from "./types.js";
import { writeCompletionWriteback } from "./completion-writeback.js";
import { toErrorString } from "../../utils/type-guards.js";

export async function handleStopSignal(
  ctx: OutcomeContext,
  stopSignal: StopSignal,
  entry: RunningEntry,
  issue: Issue,
  workspace: Workspace,
  modelSelection: ModelSelection,
  attempt: number | null,
  turnCount: number | null = null,
): Promise<void> {
  const { pullRequestUrl, summary } = await runGitPostRun(ctx, stopSignal, entry, workspace, issue);

  await ctx.deps.attemptStore
    .updateAttempt(entry.runId, {
      stopSignal,
      pullRequestUrl,
      summary,
      status: stopSignal === "blocked" ? "paused" : "completed",
    })
    .catch((error) => {
      ctx.deps.logger.info(
        { attempt_id: entry.runId, error: toErrorString(error) },
        "attempt update failed after stop signal (non-fatal)",
      );
    });

  if (pullRequestUrl) {
    ctx.deps.logger.info({ issue_identifier: issue.identifier, url: pullRequestUrl }, "pull request created");
    registerPrForMonitoring(ctx, entry, issue, pullRequestUrl).catch((error) => {
      ctx.deps.logger.warn(
        { issue_identifier: issue.identifier, error: toErrorString(error) },
        "PR registration for monitoring failed (non-fatal)",
      );
    });
  }

  const isBlocked = stopSignal === "blocked";
  const statusMessage = isBlocked ? "worker reported issue blocked" : "worker reported issue complete";
  const status = isBlocked ? "paused" : "completed";
  ctx.completedViews.set(
    issue.identifier,
    buildOutcomeView(issue, workspace, entry, modelSelection, {
      status,
      attempt,
      message: statusMessage,
      pullRequestUrl,
    }),
  );
  ctx.notify({
    type: isBlocked ? "worker_failed" : "worker_completed",
    severity: isBlocked ? "critical" : "info",
    timestamp: nowIso(),
    message: statusMessage,
    issue: issueRef(issue),
    attempt,
    metadata: { workspace: workspace.path, pullRequestUrl },
  });
  ctx.deps.eventBus?.emit("issue.completed", {
    issueId: issue.id,
    identifier: issue.identifier,
    outcome: isBlocked ? "paused" : "completed",
  });
  // DONE keeps the claim sticky until terminal; BLOCKED releases it for a later retry.
  if (isBlocked) {
    ctx.releaseIssueClaim(issue.id);
  }

  // Await writeback so we can update the view's state if Linear transition succeeds.
  const transitionedState = await runWriteback(ctx, { issue, entry, attempt, stopSignal, pullRequestUrl, turnCount });
  if (transitionedState) {
    const view = ctx.completedViews.get(issue.identifier);
    if (view) {
      view.state = transitionedState;
    }
  }
}

async function runGitPostRun(
  ctx: OutcomeContext,
  stopSignal: StopSignal,
  entry: RunningEntry,
  workspace: Workspace,
  issue: Issue,
): Promise<{ pullRequestUrl: string | null; summary: string | null }> {
  if (stopSignal !== "done" || !entry.repoMatch || !ctx.deps.gitManager) {
    return { pullRequestUrl: null, summary: null };
  }
  try {
    const result = await executeGitPostRun(ctx.deps.gitManager, workspace, issue, entry.repoMatch);
    return { pullRequestUrl: result.pullRequestUrl, summary: result.summary };
  } catch (error) {
    ctx.deps.logger.info(
      { issue_identifier: issue.identifier, error: toErrorString(error) },
      "git post-run failed after DONE — completing issue anyway",
    );
    return { pullRequestUrl: null, summary: null };
  }
}

async function runWriteback(
  ctx: OutcomeContext,
  input: Parameters<typeof writeCompletionWriteback>[1],
): Promise<string | null> {
  return writeCompletionWriteback(ctx, input).catch((error) => {
    ctx.deps.logger.warn(
      { issue_identifier: input.issue.identifier, error: toErrorString(error) },
      "completion writeback failed (non-fatal)",
    );
    return null;
  });
}

/**
 * Register a newly-created PR in the attempt store for monitor polling.
 * All failures are silently skipped — PR registration is best-effort.
 */
async function registerPrForMonitoring(
  ctx: OutcomeContext,
  entry: RunningEntry,
  issue: Issue,
  pullRequestUrl: string,
): Promise<void> {
  const repoMatch = entry.repoMatch;
  if (!repoMatch) return;
  const owner = repoMatch.githubOwner ?? null;
  const repoName = repoMatch.githubRepo ?? null;
  if (!owner || !repoName) return;
  const pullNumberMatch = /\/pull\/(\d+)$/.exec(pullRequestUrl);
  if (!pullNumberMatch) return;
  const pullNumber = parseInt(pullNumberMatch[1], 10);
  const now = new Date().toISOString();
  const attemptStore = ctx.deps.attemptStore;
  if (!attemptStore.upsertPr) {
    ctx.deps.logger.warn({ issue_identifier: issue.identifier }, "PR registration skipped: upsertPr not available");
    return;
  }
  try {
    await attemptStore.upsertPr({
      issueId: issue.id,
      owner,
      repo: repoName,
      pullNumber,
      url: pullRequestUrl,
      attemptId: entry.runId,
      status: "open",
      createdAt: now,
      updatedAt: now,
      branchName: issue.branchName ?? "",
    });
  } catch (error) {
    ctx.deps.logger.warn(
      { issue_identifier: issue.identifier, error: toErrorString(error) },
      "PR registration for monitoring failed (non-fatal)",
    );
  }
}
