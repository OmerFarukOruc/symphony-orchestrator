import type { Issue } from "../../core/types.js";
import type { RunningEntry } from "../runtime-types.js";
import type { OutcomeContext } from "../context.js";
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
}

export async function writeCompletionWriteback(
  ctx: CompletionWritebackContext,
  input: CompletionWritebackInput,
): Promise<void> {
  const config = ctx.getConfig();
  const successState = config.agent.successState;

  const lines: string[] = ["**Risoluto agent completed** ✓"];
  if (input.entry.tokenUsage) {
    lines.push(
      `- **Tokens:** ${input.entry.tokenUsage.totalTokens.toLocaleString()} (in: ${input.entry.tokenUsage.inputTokens.toLocaleString()}, out: ${input.entry.tokenUsage.outputTokens.toLocaleString()})`,
    );
  }
  const durationSecs = Math.round((Date.now() - input.entry.startedAtMs) / 1000);
  lines.push(`- **Duration:** ${durationSecs}s`);
  if (input.attempt !== null) {
    lines.push(`- **Attempt:** ${input.attempt}`);
  }
  if (input.pullRequestUrl) {
    lines.push(`- **PR:** ${input.pullRequestUrl}`);
  }
  const commentBody = lines.join("\n");

  if (input.stopSignal === "done" && successState) {
    try {
      const stateId = await ctx.deps.tracker.resolveStateId(successState);
      if (stateId) {
        await ctx.deps.tracker.updateIssueState(input.issue.id, stateId);
        ctx.deps.logger.info(
          { issue_identifier: input.issue.identifier, successState },
          "linear issue transitioned to success state",
        );
      } else {
        ctx.deps.logger.warn(
          { issue_identifier: input.issue.identifier, successState },
          "success state not found in linear — skipping transition",
        );
      }
    } catch (error) {
      ctx.deps.logger.warn(
        { issue_identifier: input.issue.identifier, error: toErrorString(error) },
        "linear state transition failed (non-fatal)",
      );
    }
  }

  try {
    await ctx.deps.tracker.createComment(input.issue.id, commentBody);
  } catch (error) {
    ctx.deps.logger.warn(
      { issue_identifier: input.issue.identifier, error: toErrorString(error) },
      "linear completion comment failed (non-fatal)",
    );
  }
}
