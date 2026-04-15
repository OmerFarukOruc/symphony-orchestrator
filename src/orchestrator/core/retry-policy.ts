import type { RunOutcome } from "../../core/types.js";

export type RetryStrategy =
  | { action: "hard_fail" }
  | { action: "retry"; delayMs: number; reason: string }
  | { action: "compact_and_retry" }
  | { action: "default" };

type CodexErrorInfo = NonNullable<RunOutcome["codexErrorInfo"]>;

export function classifyRetryStrategy(errorInfo: CodexErrorInfo | null, _errorCode: string | null): RetryStrategy {
  if (!errorInfo) return { action: "default" };

  switch (errorInfo.type) {
    case "ContextWindowExceeded":
      return { action: "compact_and_retry" };
    case "UsageLimitExceeded":
      return { action: "retry", delayMs: 60_000, reason: "usage_limit" };
    case "RateLimited":
      return { action: "retry", delayMs: errorInfo.retryAfterMs ?? 30_000, reason: "rate_limited" };
    case "Unauthorized":
      return { action: "hard_fail" };
    default:
      return { action: "default" };
  }
}
