import type { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import type { RisolutoLogger } from "../core/types.js";
import { asRecord, asString } from "./helpers.js";
import { toErrorString } from "../utils/type-guards.js";

export interface SelfReviewResult {
  passed: boolean;
  summary: string;
}

export async function runSelfReview(
  connection: JsonRpcConnection,
  threadId: string,
  logger: RisolutoLogger,
): Promise<SelfReviewResult | null> {
  try {
    const result = await connection.request("review/start", {
      threadId,
      target: { type: "uncommittedChanges" },
    });
    const review = asRecord(result);
    return {
      passed: asString(review.status) === "passed",
      summary: asString(review.summary) ?? "review completed",
    };
  } catch (error) {
    logger.warn({ error: toErrorString(error) }, "self-review failed (non-fatal)");
    return null;
  }
}
