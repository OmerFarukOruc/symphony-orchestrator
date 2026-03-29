import { describe, expect, it } from "vitest";

import { sortAttemptsDesc, sumAttemptDurationSeconds } from "../../src/core/attempt-store-port.js";
import type { AttemptRecord } from "../../src/core/types.js";

function makeAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "Test attempt",
    workspaceKey: "MT-42",
    workspacePath: "/tmp/symphony/MT-42",
    status: "completed",
    attemptNumber: 1,
    startedAt: "2026-03-16T10:00:00.000Z",
    endedAt: "2026-03-16T10:05:00.000Z",
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: null,
    turnId: null,
    turnCount: 0,
    errorCode: null,
    errorMessage: null,
    tokenUsage: null,
    ...overrides,
  };
}

describe("sortAttemptsDesc", () => {
  it("sorts by startedAt descending (newest first)", () => {
    const older = makeAttempt({ attemptId: "a-1", startedAt: "2026-03-16T10:00:00.000Z" });
    const newer = makeAttempt({ attemptId: "a-2", startedAt: "2026-03-16T11:00:00.000Z" });

    const sorted = [older, newer].sort(sortAttemptsDesc);

    expect(sorted[0].attemptId).toBe("a-2");
    expect(sorted[1].attemptId).toBe("a-1");
  });

  it("breaks ties on startedAt by attemptNumber descending", () => {
    const low = makeAttempt({ attemptId: "a-1", attemptNumber: 1, startedAt: "2026-03-16T10:00:00.000Z" });
    const high = makeAttempt({ attemptId: "a-2", attemptNumber: 3, startedAt: "2026-03-16T10:00:00.000Z" });

    const sorted = [low, high].sort(sortAttemptsDesc);

    expect(sorted[0].attemptId).toBe("a-2");
    expect(sorted[1].attemptId).toBe("a-1");
  });

  it("breaks ties on startedAt and attemptNumber by attemptId descending", () => {
    const alpha = makeAttempt({ attemptId: "attempt-a", attemptNumber: 1, startedAt: "2026-03-16T10:00:00.000Z" });
    const beta = makeAttempt({ attemptId: "attempt-b", attemptNumber: 1, startedAt: "2026-03-16T10:00:00.000Z" });

    const sorted = [alpha, beta].sort(sortAttemptsDesc);

    expect(sorted[0].attemptId).toBe("attempt-b");
    expect(sorted[1].attemptId).toBe("attempt-a");
  });

  it("handles null attemptNumber by treating as 0", () => {
    const withNull = makeAttempt({ attemptId: "a-1", attemptNumber: null, startedAt: "2026-03-16T10:00:00.000Z" });
    const withTwo = makeAttempt({ attemptId: "a-2", attemptNumber: 2, startedAt: "2026-03-16T10:00:00.000Z" });

    const sorted = [withNull, withTwo].sort(sortAttemptsDesc);

    expect(sorted[0].attemptId).toBe("a-2");
    expect(sorted[1].attemptId).toBe("a-1");
  });

  it("returns 0 when both attempts are identical", () => {
    const attempt = makeAttempt();

    expect(sortAttemptsDesc(attempt, attempt)).toBe(0);
  });

  it("produces correct relative ordering (negative/positive return)", () => {
    const older = makeAttempt({ attemptId: "a-1", startedAt: "2026-03-16T10:00:00.000Z" });
    const newer = makeAttempt({ attemptId: "a-2", startedAt: "2026-03-16T11:00:00.000Z" });

    // newer should come first, so sortAttemptsDesc(newer, older) < 0
    expect(sortAttemptsDesc(newer, older)).toBeLessThan(0);
    // older should come after, so sortAttemptsDesc(older, newer) > 0
    expect(sortAttemptsDesc(older, newer)).toBeGreaterThan(0);
  });
});

describe("sumAttemptDurationSeconds", () => {
  it("returns 0 for an empty list", () => {
    expect(sumAttemptDurationSeconds([])).toBe(0);
  });

  it("sums duration of a single completed attempt", () => {
    const attempt = makeAttempt({
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:05:00.000Z",
    });

    expect(sumAttemptDurationSeconds([attempt])).toBe(300);
  });

  it("sums durations of multiple completed attempts", () => {
    const first = makeAttempt({
      attemptId: "a-1",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:03:00.000Z", // 180s
    });
    const second = makeAttempt({
      attemptId: "a-2",
      startedAt: "2026-03-16T11:00:00.000Z",
      endedAt: "2026-03-16T11:01:00.000Z", // 60s
    });

    expect(sumAttemptDurationSeconds([first, second])).toBe(240);
  });

  it("skips attempts without endedAt", () => {
    const running = makeAttempt({ endedAt: null });
    const completed = makeAttempt({
      attemptId: "a-2",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:02:00.000Z", // 120s
    });

    expect(sumAttemptDurationSeconds([running, completed])).toBe(120);
  });

  it("skips attempts where endedAt is before startedAt", () => {
    const invalid = makeAttempt({
      startedAt: "2026-03-16T10:05:00.000Z",
      endedAt: "2026-03-16T10:00:00.000Z",
    });

    expect(sumAttemptDurationSeconds([invalid])).toBe(0);
  });

  it("skips attempts with invalid date strings", () => {
    const invalid = makeAttempt({
      startedAt: "not-a-date",
      endedAt: "also-not-a-date",
    });

    expect(sumAttemptDurationSeconds([invalid])).toBe(0);
  });

  it("accepts any iterable (e.g. a Set)", () => {
    const attempt = makeAttempt({
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:01:00.000Z", // 60s
    });

    expect(sumAttemptDurationSeconds(new Set([attempt]))).toBe(60);
  });

  it("handles zero-duration attempts (endedAt equals startedAt)", () => {
    const instant = makeAttempt({
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:00:00.000Z",
    });

    expect(sumAttemptDurationSeconds([instant])).toBe(0);
  });
});
