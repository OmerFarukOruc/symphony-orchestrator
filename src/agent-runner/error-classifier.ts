import { asRecord, asString } from "./helpers.js";

export interface CodexErrorInfo {
  type: string;
  message: string;
  retryAfterMs?: number;
}

export function extractCodexErrorInfo(errorRecord: Record<string, unknown>): CodexErrorInfo | null {
  const info = asRecord(errorRecord.codexErrorInfo);
  const infoType = asString(info.type);
  if (infoType) {
    return {
      type: infoType,
      message: asString(info.message) ?? infoType,
      retryAfterMs: typeof info.retryAfterMs === "number" ? info.retryAfterMs : undefined,
    };
  }
  const errorType = asString(errorRecord.type);
  if (errorType) {
    return {
      type: errorType,
      message: asString(errorRecord.message) ?? errorType,
      retryAfterMs: typeof errorRecord.retryAfterMs === "number" ? errorRecord.retryAfterMs : undefined,
    };
  }
  return null;
}

export type RetryStrategy =
  | { action: "hard_fail" }
  | { action: "retry"; delayMs: number; reason: string }
  | { action: "compact_and_retry" }
  | { action: "default" };

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
