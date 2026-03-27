import { describe, expect, it } from "vitest";

import { isHardFailure, issueView, usageDelta, nowIso } from "../../src/orchestrator/views.js";
import type { Issue } from "../../src/core/types.js";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "MT-1",
    title: "Test issue",
    description: "desc",
    priority: 1,
    state: "In Progress",
    branchName: "mt-1-test-issue",
    url: "https://linear.app/mt/issue/MT-1",
    labels: [],
    blockedBy: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

describe("isHardFailure", () => {
  it("returns true for known hard failure codes", () => {
    const hardCodes = [
      "startup_failed",
      "inactive",
      "terminal",
      "shutdown",
      "cancelled",
      "auth_token_expired",
      "unauthorized",
    ];
    for (const code of hardCodes) {
      expect(isHardFailure(code), `expected ${code} to be a hard failure`).toBe(true);
    }
  });

  it("returns false for retryable codes", () => {
    const retryCodes = [
      "turn_failed",
      "port_exit",
      "turn_timeout",
      "read_timeout",
      "startup_timeout",
      "container_oom",
      "turn_input_required",
    ];
    for (const code of retryCodes) {
      expect(isHardFailure(code), `expected ${code} to not be a hard failure`).toBe(false);
    }
  });

  it("returns false for null", () => {
    expect(isHardFailure(null)).toBe(false);
  });

  it("returns false for unknown string", () => {
    expect(isHardFailure("some_random_code")).toBe(false);
  });
});

describe("issueView", () => {
  it("maps issue fields to view fields", () => {
    const issue = makeIssue();
    const view = issueView(issue);
    expect(view.issueId).toBe(issue.id);
    expect(view.identifier).toBe(issue.identifier);
    expect(view.title).toBe(issue.title);
    expect(view.state).toBe(issue.state);
    expect(view.status).toBe(issue.state);
    expect(view.url).toBe(issue.url);
    expect(view.description).toBe(issue.description);
    expect(view.blockedBy).toBe(issue.blockedBy);
    expect(view.branchName).toBe(issue.branchName);
    expect(view.createdAt).toBe(issue.createdAt);
    expect(view.workspaceKey).toBe(null);
    expect(view.message).toBe(null);
    expect(view.attempt).toBe(null);
    expect(view.error).toBe(null);
  });

  it("uses issue.updatedAt as updatedAt when present", () => {
    const issue = makeIssue({ updatedAt: "2026-06-01T00:00:00Z" });
    const view = issueView(issue);
    expect(view.updatedAt).toBe("2026-06-01T00:00:00Z");
  });

  it("falls back to nowIso() when updatedAt is null", () => {
    const before = Date.now();
    const issue = makeIssue({ updatedAt: null });
    const view = issueView(issue);
    const after = Date.now();
    const viewTime = new Date(view.updatedAt).getTime();
    expect(viewTime).toBeGreaterThanOrEqual(before);
    expect(viewTime).toBeLessThanOrEqual(after);
  });

  it("merges extra fields via the overrides parameter", () => {
    const issue = makeIssue();
    const view = issueView(issue, { status: "completed", attempt: 3, error: "oops", message: "done" });
    expect(view.status).toBe("completed");
    expect(view.attempt).toBe(3);
    expect(view.error).toBe("oops");
    expect(view.message).toBe("done");
    // original fields still present
    expect(view.issueId).toBe(issue.id);
  });
});

describe("usageDelta", () => {
  it("computes difference between snapshots", () => {
    const previous = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
    const next = { inputTokens: 200, outputTokens: 80, totalTokens: 280 };
    const delta = usageDelta(previous, next);
    expect(delta).toEqual({ inputTokens: 100, outputTokens: 30, totalTokens: 130 });
  });

  it("treats null previous as zero baseline", () => {
    const next = { inputTokens: 200, outputTokens: 80, totalTokens: 280 };
    const delta = usageDelta(null, next);
    expect(delta).toEqual(next);
  });

  it("clamps negative values to zero", () => {
    // next is lower than previous (shouldn't happen in practice, but must not return negative)
    const previous = { inputTokens: 300, outputTokens: 100, totalTokens: 400 };
    const next = { inputTokens: 200, outputTokens: 80, totalTokens: 280 };
    const delta = usageDelta(previous, next);
    expect(delta.inputTokens).toBe(0);
    expect(delta.outputTokens).toBe(0);
    expect(delta.totalTokens).toBe(0);
  });
});

describe("nowIso", () => {
  it("returns a valid ISO timestamp string", () => {
    const result = nowIso();
    expect(() => new Date(result)).not.toThrow();
    expect(new Date(result).toISOString()).toBe(result);
  });
});
