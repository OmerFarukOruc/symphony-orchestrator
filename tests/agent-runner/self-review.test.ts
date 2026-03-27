import { describe, expect, it, vi } from "vitest";
import { runSelfReview } from "../../src/agent-runner/self-review.js";
import { createMockLogger } from "../helpers.js";

describe("runSelfReview", () => {
  it("returns passed result on success", async () => {
    const connection = { request: vi.fn().mockResolvedValue({ status: "passed", summary: "All good" }) };
    const result = await runSelfReview(connection as never, "thread-1", createMockLogger());
    expect(result).toEqual({ passed: true, summary: "All good" });
  });

  it("returns failed result when status is not passed", async () => {
    const connection = { request: vi.fn().mockResolvedValue({ status: "failed", summary: "Found issues" }) };
    const result = await runSelfReview(connection as never, "thread-1", createMockLogger());
    expect(result).toEqual({ passed: false, summary: "Found issues" });
  });

  it("returns null on error (non-fatal)", async () => {
    const connection = { request: vi.fn().mockRejectedValue(new Error("unsupported")) };
    const logger = createMockLogger();
    const result = await runSelfReview(connection as never, "thread-1", logger);
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("handles missing summary field", async () => {
    const connection = { request: vi.fn().mockResolvedValue({ status: "passed" }) };
    const result = await runSelfReview(connection as never, "thread-1", createMockLogger());
    expect(result?.summary).toBe("review completed");
  });
});
