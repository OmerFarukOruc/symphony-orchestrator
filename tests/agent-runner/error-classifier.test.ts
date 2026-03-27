import { describe, expect, it } from "vitest";

import { extractCodexErrorInfo, classifyRetryStrategy } from "../../src/agent-runner/error-classifier.js";
import type { CodexErrorInfo } from "../../src/agent-runner/error-classifier.js";

describe("extractCodexErrorInfo", () => {
  it("extracts from codexErrorInfo field when present", () => {
    const result = extractCodexErrorInfo({
      codexErrorInfo: { type: "RateLimited", message: "slow down" },
    });
    expect(result).toEqual({ type: "RateLimited", message: "slow down" });
  });

  it("falls back to error.type field when codexErrorInfo is absent", () => {
    const result = extractCodexErrorInfo({
      type: "Unauthorized",
      message: "invalid key",
    });
    expect(result).toEqual({ type: "Unauthorized", message: "invalid key" });
  });

  it("returns null for empty error record", () => {
    expect(extractCodexErrorInfo({})).toBeNull();
  });

  it("returns null when codexErrorInfo has no type", () => {
    expect(extractCodexErrorInfo({ codexErrorInfo: { message: "no type" } })).toBeNull();
  });

  it("includes retryAfterMs from codexErrorInfo when present", () => {
    const result = extractCodexErrorInfo({
      codexErrorInfo: { type: "RateLimited", message: "wait", retryAfterMs: 5000 },
    });
    expect(result).toEqual({ type: "RateLimited", message: "wait", retryAfterMs: 5000 });
  });

  it("includes retryAfterMs from fallback error.type path", () => {
    const result = extractCodexErrorInfo({
      type: "RateLimited",
      message: "wait",
      retryAfterMs: 12000,
    });
    expect(result).toEqual({ type: "RateLimited", message: "wait", retryAfterMs: 12000 });
  });

  it("ignores non-number retryAfterMs", () => {
    const result = extractCodexErrorInfo({
      codexErrorInfo: { type: "RateLimited", message: "wait", retryAfterMs: "not a number" },
    });
    expect(result).toEqual({ type: "RateLimited", message: "wait" });
  });

  it("uses type as message when message is missing", () => {
    const result = extractCodexErrorInfo({
      codexErrorInfo: { type: "ContextWindowExceeded" },
    });
    expect(result).toEqual({ type: "ContextWindowExceeded", message: "ContextWindowExceeded" });
  });

  it("prefers codexErrorInfo over top-level type", () => {
    const result = extractCodexErrorInfo({
      codexErrorInfo: { type: "RateLimited", message: "from info" },
      type: "Unauthorized",
      message: "from top",
    });
    expect(result).toEqual({ type: "RateLimited", message: "from info" });
  });
});

describe("classifyRetryStrategy", () => {
  it("returns compact_and_retry for ContextWindowExceeded", () => {
    const info: CodexErrorInfo = { type: "ContextWindowExceeded", message: "too big" };
    expect(classifyRetryStrategy(info, "turn_failed")).toEqual({ action: "compact_and_retry" });
  });

  it("returns retry with 60s for UsageLimitExceeded", () => {
    const info: CodexErrorInfo = { type: "UsageLimitExceeded", message: "limit hit" };
    expect(classifyRetryStrategy(info, "turn_failed")).toEqual({
      action: "retry",
      delayMs: 60_000,
      reason: "usage_limit",
    });
  });

  it("returns retry with 30s default for RateLimited", () => {
    const info: CodexErrorInfo = { type: "RateLimited", message: "slow down" };
    expect(classifyRetryStrategy(info, "turn_failed")).toEqual({
      action: "retry",
      delayMs: 30_000,
      reason: "rate_limited",
    });
  });

  it("uses retryAfterMs from error info for RateLimited when available", () => {
    const info: CodexErrorInfo = { type: "RateLimited", message: "slow down", retryAfterMs: 5000 };
    expect(classifyRetryStrategy(info, "turn_failed")).toEqual({
      action: "retry",
      delayMs: 5000,
      reason: "rate_limited",
    });
  });

  it("returns hard_fail for Unauthorized", () => {
    const info: CodexErrorInfo = { type: "Unauthorized", message: "invalid key" };
    expect(classifyRetryStrategy(info, "turn_failed")).toEqual({ action: "hard_fail" });
  });

  it("returns default for unknown error type", () => {
    const info: CodexErrorInfo = { type: "SomethingElse", message: "unknown" };
    expect(classifyRetryStrategy(info, "turn_failed")).toEqual({ action: "default" });
  });

  it("returns default when errorInfo is null", () => {
    expect(classifyRetryStrategy(null, "turn_failed")).toEqual({ action: "default" });
  });

  it("returns default when errorInfo is null and errorCode is null", () => {
    expect(classifyRetryStrategy(null, null)).toEqual({ action: "default" });
  });
});
