import type { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import type { RisolutoLogger } from "../core/types.js";
import { asRecord, asString, extractTurnId } from "./helpers.js";
import { consumeReviewSummary, waitForTurnCompletion, type TurnState } from "./turn-state.js";
import { toErrorString } from "../utils/type-guards.js";

export interface SelfReviewResult {
  passed: boolean | null;
  summary: string;
}

function classifyReviewSummary(summary: string): boolean | null {
  const normalized = summary.toLowerCase();
  if (normalized === "review completed") {
    return null;
  }
  if (
    normalized.includes("no findings") ||
    normalized.includes("looks solid") ||
    normalized.includes("no issues found") ||
    normalized.includes("nothing to fix")
  ) {
    return true;
  }
  if (summary.trim().length > 0) {
    return false;
  }
  return null;
}

export async function runSelfReview(
  connection: JsonRpcConnection,
  turnState: TurnState,
  threadId: string,
  logger: RisolutoLogger,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<SelfReviewResult | null> {
  try {
    const result = await connection.request("review/start", {
      threadId,
      delivery: "inline",
      target: { type: "uncommittedChanges" },
    });
    const review = asRecord(result);
    const reviewTurnId = extractTurnId(review);
    if (reviewTurnId) {
      await waitForTurnCompletion(turnState, {
        turnId: reviewTurnId,
        signal,
        timeoutMs,
      });
      const summary = consumeReviewSummary(turnState, reviewTurnId) ?? "review completed";
      return {
        passed: classifyReviewSummary(summary),
        summary,
      };
    }
    return {
      passed: asString(review.status) === "passed" ? true : asString(review.status) ? false : null,
      summary: asString(review.summary) ?? "review completed",
    };
  } catch (error) {
    logger.warn({ error: toErrorString(error) }, "self-review failed (non-fatal)");
    return null;
  }
}
