import { describe, expect, it, vi } from "vitest";
import { runSelfReview } from "../../src/agent-runner/self-review.js";
import { createMockLogger } from "../helpers.js";
import { createTurnState, recordCompletedTurn, recordReviewSummary } from "../../src/agent-runner/turn-state.js";

describe("runSelfReview", () => {
  it("returns passed result on success", async () => {
    const connection = { request: vi.fn().mockResolvedValue({ status: "passed", summary: "All good" }) };
    const result = await runSelfReview(
      connection as never,
      createTurnState(),
      "thread-1",
      createMockLogger(),
      new AbortController().signal,
      5_000,
    );
    expect(result).toEqual({ passed: true, summary: "All good" });
  });

  it("returns failed result when status is not passed", async () => {
    const connection = { request: vi.fn().mockResolvedValue({ status: "failed", summary: "Found issues" }) };
    const result = await runSelfReview(
      connection as never,
      createTurnState(),
      "thread-1",
      createMockLogger(),
      new AbortController().signal,
      5_000,
    );
    expect(result).toEqual({ passed: false, summary: "Found issues" });
  });

  it("returns null on error (non-fatal)", async () => {
    const connection = { request: vi.fn().mockRejectedValue(new Error("unsupported")) };
    const logger = createMockLogger();
    const result = await runSelfReview(
      connection as never,
      createTurnState(),
      "thread-1",
      logger,
      new AbortController().signal,
      5_000,
    );
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("handles missing summary field", async () => {
    const connection = { request: vi.fn().mockResolvedValue({ status: "passed" }) };
    const result = await runSelfReview(
      connection as never,
      createTurnState(),
      "thread-1",
      createMockLogger(),
      new AbortController().signal,
      5_000,
    );
    expect(result?.summary).toBe("review completed");
  });

  it("waits for the streamed review turn and consumes the review summary", async () => {
    const turnState = createTurnState();
    recordReviewSummary(turnState, "review-turn", "Looks solid overall.");
    recordCompletedTurn(turnState, "review-turn", { turn: { id: "review-turn", status: "completed" } });
    const connection = { request: vi.fn().mockResolvedValue({ turn: { id: "review-turn" } }) };

    const result = await runSelfReview(
      connection as never,
      turnState,
      "thread-1",
      createMockLogger(),
      new AbortController().signal,
      5_000,
    );

    expect(result).toEqual({ passed: true, summary: "Looks solid overall." });
  });
});
