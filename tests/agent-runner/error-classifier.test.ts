import { describe, expect, it } from "vitest";

import { extractCodexErrorInfo } from "../../src/agent-runner/error-classifier.js";

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
