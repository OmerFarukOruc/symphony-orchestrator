import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchPRReviewFeedback,
  formatPRFeedbackForPrompt,
  type PRReviewFeedback,
} from "../../src/git/pr-review-ingester.js";

// ---------------------------------------------------------------------------
// Helpers — stub the child_process + util modules used by fetchPRReviewFeedback
// ---------------------------------------------------------------------------

type ExecFileAsyncFn = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

/**
 * Replaces the dynamic import("node:child_process") / import("node:util") calls
 * inside fetchPRReviewFeedback by mocking the modules at the Node level.
 */
vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:util", () => ({
  promisify: (_fn: unknown) => mockedExecFileAsync,
}));

let mockedExecFileAsync: ExecFileAsyncFn = async () => ({ stdout: "[]", stderr: "" });

function setExecResults(results: Array<{ stdout: string } | Error>): void {
  let callIndex = 0;
  mockedExecFileAsync = async (_cmd: string, _args: string[]) => {
    const result = results[callIndex++];
    if (result instanceof Error) {
      throw result;
    }
    return { stdout: result.stdout, stderr: "" };
  };
}

// ---------------------------------------------------------------------------
// formatPRFeedbackForPrompt — pure function, no mocking needed
// ---------------------------------------------------------------------------

describe("formatPRFeedbackForPrompt", () => {
  it("returns empty string when feedback has no reviews, comments, or inline comments", () => {
    const feedback: PRReviewFeedback = {
      prNumber: 42,
      prUrl: "https://github.com/acme/backend/pull/42",
      reviews: [],
      comments: [],
      inlineComments: [],
    };
    expect(formatPRFeedbackForPrompt(feedback)).toBe("");
  });

  it("formats reviews with author and state", () => {
    const feedback: PRReviewFeedback = {
      prNumber: 7,
      prUrl: "https://github.com/acme/backend/pull/7",
      reviews: [{ author: "alice", state: "CHANGES_REQUESTED", body: "Please fix the null check." }],
      comments: [],
      inlineComments: [],
    };
    const result = formatPRFeedbackForPrompt(feedback);
    expect(result).toContain("## Previous PR Review Feedback");
    expect(result).toContain("**@alice** (CHANGES_REQUESTED):");
    expect(result).toContain("Please fix the null check.");
    expect(result).toContain("[#7](https://github.com/acme/backend/pull/7)");
  });

  it("formats PR-level comments with author", () => {
    const feedback: PRReviewFeedback = {
      prNumber: 10,
      prUrl: "https://github.com/acme/backend/pull/10",
      reviews: [],
      comments: [{ author: "bob", body: "Needs docs update." }],
      inlineComments: [],
    };
    const result = formatPRFeedbackForPrompt(feedback);
    expect(result).toContain("### PR Comments");
    expect(result).toContain("**@bob**:");
    expect(result).toContain("Needs docs update.");
  });

  it("formats inline comments with author and file path", () => {
    const feedback: PRReviewFeedback = {
      prNumber: 15,
      prUrl: "https://github.com/acme/backend/pull/15",
      reviews: [],
      comments: [],
      inlineComments: [{ author: "carol", path: "src/foo.ts", body: "Extract this to a helper." }],
    };
    const result = formatPRFeedbackForPrompt(feedback);
    expect(result).toContain("### Inline Review Comments");
    expect(result).toContain("**@carol** on `src/foo.ts`:");
    expect(result).toContain("Extract this to a helper.");
  });

  it("includes all three sections when all are populated", () => {
    const feedback: PRReviewFeedback = {
      prNumber: 20,
      prUrl: "https://github.com/acme/backend/pull/20",
      reviews: [{ author: "alice", state: "APPROVED", body: "LGTM!" }],
      comments: [{ author: "bob", body: "Minor nit." }],
      inlineComments: [{ author: "carol", path: "src/bar.ts", body: "Unused import." }],
    };
    const result = formatPRFeedbackForPrompt(feedback);
    expect(result).toContain("### Reviews");
    expect(result).toContain("### PR Comments");
    expect(result).toContain("### Inline Review Comments");
  });
});

// ---------------------------------------------------------------------------
// fetchPRReviewFeedback — uses execFile under the hood
// ---------------------------------------------------------------------------

describe("fetchPRReviewFeedback", () => {
  beforeEach(() => {
    // Reset to a safe default that returns no PR
    mockedExecFileAsync = async () => ({ stdout: "[]", stderr: "" });
  });

  it("returns null when no open PR exists for the branch", async () => {
    setExecResults([{ stdout: "[]" }]);
    const result = await fetchPRReviewFeedback("acme/backend", "feature/eng-42");
    expect(result).toBeNull();
  });

  it("returns null when gh command throws (not authenticated, etc.)", async () => {
    setExecResults([new Error("gh: not authenticated")]);
    const result = await fetchPRReviewFeedback("acme/backend", "feature/eng-42");
    expect(result).toBeNull();
  });

  it("returns null when PR list JSON is malformed", async () => {
    setExecResults([{ stdout: "not-json" }]);
    const result = await fetchPRReviewFeedback("acme/backend", "feature/eng-42");
    expect(result).toBeNull();
  });

  it("returns null when pr view command throws", async () => {
    setExecResults([
      { stdout: JSON.stringify([{ number: 99, url: "https://github.com/acme/backend/pull/99" }]) },
      new Error("gh: network error"),
    ]);
    const result = await fetchPRReviewFeedback("acme/backend", "feature/eng-42");
    expect(result).toBeNull();
  });

  it("returns structured feedback when PR exists with reviews and comments", async () => {
    const prListResponse = JSON.stringify([{ number: 42, url: "https://github.com/acme/backend/pull/42" }]);

    const prViewResponse = JSON.stringify({
      reviews: [
        { state: "CHANGES_REQUESTED", body: "Fix the null check.", user: { login: "alice" } },
        { state: "APPROVED", body: "Looks good now.", user: { login: "bob" } },
        // Empty body should be filtered out
        { state: "COMMENTED", body: "   ", user: { login: "carol" } },
      ],
      comments: [{ body: "Please add a test.", user: { login: "dave" } }],
      reviewThreads: [
        {
          comments: [{ body: "Extract this.", path: "src/util.ts", author: { login: "eve" } }],
        },
      ],
    });

    setExecResults([{ stdout: prListResponse }, { stdout: prViewResponse }]);

    const result = await fetchPRReviewFeedback("acme/backend", "feature/eng-42");

    expect(result).not.toBeNull();
    expect(result!.prNumber).toBe(42);
    expect(result!.prUrl).toBe("https://github.com/acme/backend/pull/42");

    expect(result!.reviews).toHaveLength(2);
    expect(result!.reviews[0]).toEqual({
      author: "alice",
      state: "CHANGES_REQUESTED",
      body: "Fix the null check.",
    });
    expect(result!.reviews[1]).toEqual({
      author: "bob",
      state: "APPROVED",
      body: "Looks good now.",
    });

    expect(result!.comments).toHaveLength(1);
    expect(result!.comments[0]).toEqual({ author: "dave", body: "Please add a test." });

    expect(result!.inlineComments).toHaveLength(1);
    expect(result!.inlineComments[0]).toEqual({
      author: "eve",
      path: "src/util.ts",
      body: "Extract this.",
    });
  });

  it("falls back to 'unknown' author when user.login is absent", async () => {
    const prListResponse = JSON.stringify([{ number: 5, url: "https://github.com/acme/backend/pull/5" }]);
    const prViewResponse = JSON.stringify({
      reviews: [{ state: "COMMENTED", body: "Interesting approach.", user: {} }],
      comments: [{ body: "Nice work.", user: null }],
      reviewThreads: [],
    });

    setExecResults([{ stdout: prListResponse }, { stdout: prViewResponse }]);

    const result = await fetchPRReviewFeedback("acme/backend", "feature/eng-5");
    expect(result).not.toBeNull();
    expect(result!.reviews[0].author).toBe("unknown");
    expect(result!.comments[0].author).toBe("unknown");
  });

  it("returns empty arrays when reviews / comments / threads are absent from payload", async () => {
    const prListResponse = JSON.stringify([{ number: 3, url: "https://github.com/acme/backend/pull/3" }]);
    const prViewResponse = JSON.stringify({});

    setExecResults([{ stdout: prListResponse }, { stdout: prViewResponse }]);

    const result = await fetchPRReviewFeedback("acme/backend", "feature/eng-3");
    expect(result).not.toBeNull();
    expect(result!.reviews).toEqual([]);
    expect(result!.comments).toEqual([]);
    expect(result!.inlineComments).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Prompt injection integration — verify that formatPRFeedbackForPrompt output
// can be appended to a base prompt and contains the expected heading.
// ---------------------------------------------------------------------------

describe("prompt injection contract", () => {
  it("produces a string that starts with the heading when feedback has content", () => {
    const feedback: PRReviewFeedback = {
      prNumber: 1,
      prUrl: "https://github.com/acme/backend/pull/1",
      reviews: [{ author: "alice", state: "CHANGES_REQUESTED", body: "Fix types." }],
      comments: [],
      inlineComments: [],
    };
    const formatted = formatPRFeedbackForPrompt(feedback);
    const basePrompt = "Implement the feature as described.";
    const combined = `${basePrompt}\n\n${formatted}`;

    expect(combined).toContain("## Previous PR Review Feedback");
    expect(combined).toContain("Fix types.");
    // Ensure heading comes after the base prompt content
    expect(combined.indexOf("## Previous PR Review Feedback")).toBeGreaterThan(
      combined.indexOf("Implement the feature"),
    );
  });

  it("does not inject anything when feedback is empty", () => {
    const feedback: PRReviewFeedback = {
      prNumber: 1,
      prUrl: "https://github.com/acme/backend/pull/1",
      reviews: [],
      comments: [],
      inlineComments: [],
    };
    const formatted = formatPRFeedbackForPrompt(feedback);
    expect(formatted).toBe("");

    // No injection needed — caller checks for empty string before appending
    const basePrompt = "Implement the feature.";
    const combined = formatted ? `${basePrompt}\n\n${formatted}` : basePrompt;
    expect(combined).toBe("Implement the feature.");
  });
});
