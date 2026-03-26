import type { OutcomeContext } from "../context.js";
import { buildOutcomeView } from "../outcome-view-builder.js";
import { nowIso } from "../views.js";
import type { WorkerOutcomeInput, PreparedWorkerOutcome } from "./types.js";
import { outcomeToStatus } from "./types.js";

export async function prepareWorkerOutcome(
  ctx: OutcomeContext,
  input: WorkerOutcomeInput,
): Promise<PreparedWorkerOutcome> {
  const { outcome, entry, issue, workspace, attempt } = input;

  await entry.flushPersistence();
  ctx.runningEntries.delete(issue.id);

  const latestIssue = (await ctx.deps.tracker.fetchIssueStatesByIds([issue.id]).catch(() => [issue]))[0] ?? issue;

  await ctx.deps.attemptStore.updateAttempt(entry.runId, {
    issueId: latestIssue.id,
    issueIdentifier: latestIssue.identifier,
    title: latestIssue.title,
    status: outcomeToStatus(outcome.kind),
    endedAt: nowIso(),
    threadId: outcome.threadId ?? entry.sessionId,
    turnId: outcome.turnId,
    turnCount: outcome.turnCount,
    errorCode: outcome.errorCode,
    errorMessage: outcome.errorMessage,
    tokenUsage: entry.tokenUsage,
  });

  const modelSelection = ctx.resolveModelSelection(latestIssue.identifier);
  ctx.detailViews.set(
    latestIssue.identifier,
    buildOutcomeView(latestIssue, workspace, entry, modelSelection, {
      status: outcome.kind,
      attempt,
      error: outcome.errorMessage,
      message: outcome.errorMessage,
    }),
  );

  return { ...input, latestIssue, modelSelection };
}
