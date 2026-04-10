import { describe, expect, it } from "vitest";

import { classifyRetryStrategy } from "../../src/orchestrator/retry-policy.js";

describe("classifyRetryStrategy", () => {
  it("returns compact_and_retry for ContextWindowExceeded", () => {
    expect(classifyRetryStrategy({ type: "ContextWindowExceeded", message: "too big" }, "turn_failed")).toEqual({
      action: "compact_and_retry",
    });
  });

  it("returns retry with 60s for UsageLimitExceeded", () => {
    expect(classifyRetryStrategy({ type: "UsageLimitExceeded", message: "limit hit" }, "turn_failed")).toEqual({
      action: "retry",
      delayMs: 60_000,
      reason: "usage_limit",
    });
  });

  it("returns retry with 30s default for RateLimited", () => {
    expect(classifyRetryStrategy({ type: "RateLimited", message: "slow down" }, "turn_failed")).toEqual({
      action: "retry",
      delayMs: 30_000,
      reason: "rate_limited",
    });
  });

  it("uses retryAfterMs from error info for RateLimited when available", () => {
    expect(
      classifyRetryStrategy({ type: "RateLimited", message: "slow down", retryAfterMs: 5000 }, "turn_failed"),
    ).toEqual({
      action: "retry",
      delayMs: 5000,
      reason: "rate_limited",
    });
  });

  it("returns hard_fail for Unauthorized", () => {
    expect(classifyRetryStrategy({ type: "Unauthorized", message: "invalid key" }, "turn_failed")).toEqual({
      action: "hard_fail",
    });
  });

  it("returns default for unknown error type", () => {
    expect(classifyRetryStrategy({ type: "SomethingElse", message: "unknown" }, "turn_failed")).toEqual({
      action: "default",
    });
  });

  it("returns default when errorInfo is null", () => {
    expect(classifyRetryStrategy(null, "turn_failed")).toEqual({ action: "default" });
  });

  it("returns default when errorInfo is null and errorCode is null", () => {
    expect(classifyRetryStrategy(null, null)).toEqual({ action: "default" });
  });
});
