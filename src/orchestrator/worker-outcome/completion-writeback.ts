import type { Issue } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import type { OutcomeContext } from "../context.js";
import { computeAttemptCostUsd } from "../../core/model-pricing.js";
import { toErrorString } from "../../utils/type-guards.js";

export type CompletionWritebackContext = Pick<OutcomeContext, "getConfig"> & {
  deps: Pick<OutcomeContext["deps"], "tracker" | "logger">;
};

export interface CompletionWritebackInput {
  issue: Issue;
  entry: RunningEntry;
  attempt: number | null;
  stopSignal: "done" | "blocked";
  pullRequestUrl: string | null;
  /** Turn count sourced from RunOutcome.turnCount (persisted via prepareWorkerOutcome). */
  turnCount: number | null;
}

export interface FailureWritebackInput {
  issue: Issue;
  entry: RunningEntry;
  attemptCount: number | null;
  errorReason: string;
}

const integerFormatter = new Intl.NumberFormat("en-US");

function formatTokenCount(value: number): string {
  return integerFormatter.format(value);
}

function buildSuccessCommentBody(input: CompletionWritebackInput, durationSeconds: number): string {
  const lines: string[] = ["**Risoluto agent completed**"];
  if (input.attempt !== null) {
    lines.push(`- **Attempt:** ${input.attempt}`);
  }
  if (typeof input.turnCount === "number") {
    lines.push(`- **Turns:** ${input.turnCount}`);
  }
  lines.push(`- **Duration:** ${durationSeconds}s`);
  if (input.entry.tokenUsage) {
    const { totalTokens, inputTokens, outputTokens } = input.entry.tokenUsage;
    lines.push(
      `- **Tokens:** ${formatTokenCount(totalTokens)} ` +
        `(in: ${formatTokenCount(inputTokens)}, out: ${formatTokenCount(outputTokens)})`,
    );
    const costUsd = computeAttemptCostUsd({
      model: input.entry.modelSelection.model,
      tokenUsage: { inputTokens, outputTokens },
    });
    if (costUsd !== null) {
      lines.push(`- **Cost:** $${costUsd.toFixed(4)}`);
    }
  }
  if (input.pullRequestUrl) {
    lines.push(`- **PR:** ${input.pullRequestUrl}`);
  }
  return lines.join("\n");
}

async function transitionToSuccessState(
  ctx: CompletionWritebackContext,
  input: CompletionWritebackInput,
  successState: string,
): Promise<string | null> {
  try {
    const stateId = await ctx.deps.tracker.resolveStateId(successState);
    if (stateId) {
      await ctx.deps.tracker.updateIssueState(input.issue.id, stateId);
      ctx.deps.logger.info(
        { issue_identifier: input.issue.identifier, successState },
        "linear issue transitioned to success state",
      );
      return successState;
    }
    ctx.deps.logger.warn(
      { issue_identifier: input.issue.identifier, successState },
      "success state not found in linear — skipping transition",
    );
    return null;
  } catch (error) {
    ctx.deps.logger.warn(
      { issue_identifier: input.issue.identifier, error: toErrorString(error) },
      "linear state transition failed (non-fatal)",
    );
    return null;
  }
}

async function postSuccessWriteback(
  ctx: CompletionWritebackContext,
  input: CompletionWritebackInput,
  durationSeconds: number,
): Promise<string | null> {
  const commentBody = buildSuccessCommentBody(input, durationSeconds);
  const successState = ctx.getConfig().agent.successState;

  // State transition and comment are independent — failure of one must not block the other.
  const transitionedState = successState ? await transitionToSuccessState(ctx, input, successState) : null;

  try {
    await ctx.deps.tracker.createComment(input.issue.id, commentBody);
  } catch (error) {
    ctx.deps.logger.warn(
      { issue_identifier: input.issue.identifier, error: toErrorString(error) },
      "linear completion comment failed (non-fatal)",
    );
  }

  return transitionedState;
}

async function postBlockedWriteback(
  ctx: CompletionWritebackContext,
  input: CompletionWritebackInput,
  durationSeconds: number,
): Promise<void> {
  const commentBody = [
    `**Risoluto agent blocked**`,
    `- **Reason:** agent reported blocked`,
    `- **Attempts:** ${input.attempt ?? 1}`,
    `- **Duration:** ${durationSeconds}s`,
  ].join("\n");

  try {
    await ctx.deps.tracker.createComment(input.issue.id, commentBody);
  } catch (error) {
    ctx.deps.logger.warn(
      { issue_identifier: input.issue.identifier, error: toErrorString(error) },
      "linear blocked comment failed (non-fatal)",
    );
  }
}

export async function writeCompletionWriteback(
  ctx: CompletionWritebackContext,
  input: CompletionWritebackInput,
): Promise<string | null> {
  const durationSeconds = Math.round((Date.now() - input.entry.startedAtMs) / 1000);

  if (input.stopSignal === "done") {
    return postSuccessWriteback(ctx, input, durationSeconds);
  }

  // Blocked stop signal — post failure comment only; no state transition.
  await postBlockedWriteback(ctx, input, durationSeconds);
  return null;
}

/**
 * Posts a failure comment to the tracker for retry-exhausted terminal paths
 * (cancelled or hard failure, max continuations exceeded).
 *
 * Independent of orchestrator state — failures are logged at warn and swallowed.
 */
export async function writeFailureWriteback(
  ctx: CompletionWritebackContext,
  input: FailureWritebackInput,
): Promise<void> {
  const durationSeconds = Math.round((Date.now() - input.entry.startedAtMs) / 1000);
  const lines: string[] = [
    `**Risoluto agent failed**`,
    `- **Reason:** ${input.errorReason}`,
    `- **Attempts:** ${input.attemptCount ?? 1}`,
    `- **Duration:** ${durationSeconds}s`,
  ];
  const commentBody = lines.join("\n");

  try {
    await ctx.deps.tracker.createComment(input.issue.id, commentBody);
  } catch (error) {
    ctx.deps.logger.warn(
      { issue_identifier: input.issue.identifier, error: toErrorString(error) },
      "linear failure comment failed (non-fatal)",
    );
  }
}
