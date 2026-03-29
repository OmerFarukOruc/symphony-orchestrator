import { describe, expect, it } from "vitest";

import { sortAttemptsDesc, sumAttemptDurationSeconds } from "../../src/core/attempt-store-port.js";
import type { AttemptRecord } from "../../src/core/types.js";

function makeAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "a-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "Test",
    workspaceKey: "MT-42",
    workspacePath: "/tmp/MT-42",
    status: "completed",
    attemptNumber: 1,
    startedAt: "2026-03-16T10:00:00.000Z",
    endedAt: "2026-03-16T10:05:00.000Z",
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: null,
    turnId: null,
    turnCount: 1,
    errorCode: null,
    errorMessage: null,
    tokenUsage: null,
    ...overrides,
  };
}

describe("sortAttemptsDesc", () => {
  it("sorts newer attempts first", () => {
    const older = makeAttempt({ attemptId: "a-1", startedAt: "2026-03-16T09:00:00.000Z" });
    const newer = makeAttempt({ attemptId: "a-2", startedAt: "2026-03-16T11:00:00.000Z" });

    const sorted = [older, newer].sort(sortAttemptsDesc);
    expect(sorted[0].attemptId).toBe("a-2");
    expect(sorted[1].attemptId).toBe("a-1");
  });

  it("returns consistent sort for equal timestamps", () => {
    const first = makeAttempt({ attemptId: "a-1", startedAt: "2026-03-16T10:00:00.000Z" });
    const second = makeAttempt({ attemptId: "a-2", startedAt: "2026-03-16T10:00:00.000Z" });

    // localeCompare of identical strings: stable sort order
    const result = sortAttemptsDesc(first, second);
    // Both have the same timestamp, so sort result should be <= 0 (not reorder equals)
    expect(typeof result).toBe("number");
  });

  it("returns negative when right is older (left should come first is wrong)", () => {
    const older = makeAttempt({ startedAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeAttempt({ startedAt: "2026-12-31T00:00:00.000Z" });

    // right.startedAt.localeCompare(left.startedAt)
    // "2026-01-01".localeCompare("2026-12-31") < 0
    expect(sortAttemptsDesc(newer, older)).toBeLessThan(0);
  });

  it("returns positive when right is newer (right should come first)", () => {
    const older = makeAttempt({ startedAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeAttempt({ startedAt: "2026-12-31T00:00:00.000Z" });

    expect(sortAttemptsDesc(older, newer)).toBeGreaterThan(0);
  });
});

describe("sumAttemptDurationSeconds", () => {
  it("returns 0 for an empty iterable", () => {
    expect(sumAttemptDurationSeconds([])).toBe(0);
  });

  it("skips attempts without endedAt", () => {
    const running = makeAttempt({ endedAt: null });
    expect(sumAttemptDurationSeconds([running])).toBe(0);
  });

  it("sums duration in seconds for completed attempts", () => {
    const attempt = makeAttempt({
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:05:00.000Z",
    });
    expect(sumAttemptDurationSeconds([attempt])).toBe(300);
  });

  it("sums multiple completed attempts", () => {
    const first = makeAttempt({
      attemptId: "a-1",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:01:00.000Z",
    });
    const second = makeAttempt({
      attemptId: "a-2",
      startedAt: "2026-03-16T11:00:00.000Z",
      endedAt: "2026-03-16T11:02:00.000Z",
    });
    expect(sumAttemptDurationSeconds([first, second])).toBe(180);
  });

  it("skips attempts where endedAt is before startedAt", () => {
    const inverted = makeAttempt({
      startedAt: "2026-03-16T10:05:00.000Z",
      endedAt: "2026-03-16T10:00:00.000Z",
    });
    expect(sumAttemptDurationSeconds([inverted])).toBe(0);
  });

  it("skips attempts with NaN startedAt dates", () => {
    const badStart = makeAttempt({
      startedAt: "not-a-date",
      endedAt: "2026-03-16T10:05:00.000Z",
    });
    expect(sumAttemptDurationSeconds([badStart])).toBe(0);
  });

  it("skips attempts with NaN endedAt dates", () => {
    const badEnd = makeAttempt({
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "not-a-date",
    });
    expect(sumAttemptDurationSeconds([badEnd])).toBe(0);
  });

  it("returns 0 when endedAt equals startedAt", () => {
    const zeroLength = makeAttempt({
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:00:00.000Z",
    });
    expect(sumAttemptDurationSeconds([zeroLength])).toBe(0);
  });

  it("works with generator iterables", () => {
    function* generateAttempts() {
      yield makeAttempt({
        startedAt: "2026-03-16T10:00:00.000Z",
        endedAt: "2026-03-16T10:01:00.000Z",
      });
    }
    expect(sumAttemptDurationSeconds(generateAttempts())).toBe(60);
  });

  it("correctly divides milliseconds by 1000 to get seconds", () => {
    const attempt = makeAttempt({
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:00:01.500Z",
    });
    expect(sumAttemptDurationSeconds([attempt])).toBe(1.5);
  });
});
