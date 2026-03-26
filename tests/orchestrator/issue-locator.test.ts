import { describe, expect, it, vi } from "vitest";

import { resolveIssue, toIssueView, type IssueLocatorCallbacks } from "../../src/orchestrator/issue-locator.js";
import {
  createIssue,
  createModelSelection,
  createRunningEntry,
  createRetryEntry,
  createCompletedView,
  createDetailView,
} from "./issue-test-factories.js";

function createCallbacks(overrides?: Partial<IssueLocatorCallbacks>): IssueLocatorCallbacks {
  return {
    getRunningEntries: () => new Map(),
    getRetryEntries: () => new Map(),
    getCompletedViews: () => new Map(),
    getDetailViews: () => new Map(),
    resolveModelSelection: () => createModelSelection(),
    ...overrides,
  };
}

describe("issue-locator", () => {
  describe("resolveIssue", () => {
    it("returns null when the identifier is not found in any state map", () => {
      const callbacks = createCallbacks();
      const result = resolveIssue("MT-99", callbacks);
      expect(result).toBeNull();
    });

    it("finds an issue in the running state", () => {
      const runningEntry = createRunningEntry();
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["run-1", runningEntry]]),
      });

      const result = resolveIssue("MT-42", callbacks);

      expect(result).toEqual({ kind: "running", entry: runningEntry });
    });

    it("finds an issue in the retry state", () => {
      const retryEntry = createRetryEntry();
      const callbacks = createCallbacks({
        getRetryEntries: () => new Map([["MT-43", retryEntry]]),
      });

      const result = resolveIssue("MT-43", callbacks);

      expect(result).toEqual({ kind: "retry", entry: retryEntry });
    });

    it("finds an issue in the completed state", () => {
      const completedView = createCompletedView();
      const callbacks = createCallbacks({
        getCompletedViews: () => new Map([["MT-44", completedView]]),
      });

      const result = resolveIssue("MT-44", callbacks);

      expect(result).toEqual({ kind: "completed", view: completedView });
    });

    it("finds an issue in the detail views", () => {
      const detailView = createDetailView();
      const callbacks = createCallbacks({
        getDetailViews: () => new Map([["MT-45", detailView]]),
      });

      const result = resolveIssue("MT-45", callbacks);

      expect(result).toEqual({ kind: "detail", view: detailView });
    });

    it("prioritizes running over retry", () => {
      const runningEntry = createRunningEntry({ issue: createIssue({ identifier: "MT-42" }) });
      const retryEntry = createRetryEntry({ identifier: "MT-42", issue: createIssue({ identifier: "MT-42" }) });
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["run-1", runningEntry]]),
        getRetryEntries: () => new Map([["MT-42", retryEntry]]),
      });

      const result = resolveIssue("MT-42", callbacks);

      expect(result?.kind).toBe("running");
    });

    it("prioritizes retry over completed", () => {
      const retryEntry = createRetryEntry({ identifier: "MT-44", issue: createIssue({ identifier: "MT-44" }) });
      const completedView = createCompletedView({ identifier: "MT-44" });
      const callbacks = createCallbacks({
        getRetryEntries: () => new Map([["MT-44", retryEntry]]),
        getCompletedViews: () => new Map([["MT-44", completedView]]),
      });

      const result = resolveIssue("MT-44", callbacks);

      expect(result?.kind).toBe("retry");
    });

    it("prioritizes completed over detail", () => {
      const completedView = createCompletedView({ identifier: "MT-45" });
      const detailView = createDetailView({ identifier: "MT-45" });
      const callbacks = createCallbacks({
        getCompletedViews: () => new Map([["MT-45", completedView]]),
        getDetailViews: () => new Map([["MT-45", detailView]]),
      });

      const result = resolveIssue("MT-45", callbacks);

      expect(result?.kind).toBe("completed");
    });

    it("resolves running entries by issue identifier, not map key", () => {
      const runningEntry = createRunningEntry({ issue: createIssue({ identifier: "MT-50" }) });
      const callbacks = createCallbacks({
        getRunningEntries: () => new Map([["arbitrary-key", runningEntry]]),
      });

      const result = resolveIssue("MT-50", callbacks);

      expect(result).toEqual({ kind: "running", entry: runningEntry });
    });

    it("resolves retry entries by identifier, not map key", () => {
      const retryEntry = createRetryEntry({ identifier: "MT-60" });
      const callbacks = createCallbacks({
        getRetryEntries: () => new Map([["arbitrary-key", retryEntry]]),
      });

      const result = resolveIssue("MT-60", callbacks);

      expect(result).toEqual({ kind: "retry", entry: retryEntry });
    });
  });

  describe("toIssueView", () => {
    it("converts a running location to a RuntimeIssueView", () => {
      const runningEntry = createRunningEntry();
      const callbacks = createCallbacks({
        resolveModelSelection: vi.fn().mockReturnValue(createModelSelection()),
      });

      const view = toIssueView({ kind: "running", entry: runningEntry }, callbacks);

      expect(view).toMatchObject({
        identifier: "MT-42",
        status: "running",
        attempt: 1,
        workspaceKey: "MT-42",
        model: "gpt-5.4",
      });
    });

    it("converts a retry location to a RuntimeIssueView", () => {
      const retryEntry = createRetryEntry();
      const callbacks = createCallbacks({
        resolveModelSelection: vi.fn().mockReturnValue(createModelSelection()),
      });

      const view = toIssueView({ kind: "retry", entry: retryEntry }, callbacks);

      expect(view).toMatchObject({
        identifier: "MT-43",
        status: "retrying",
        attempt: 2,
        error: "turn_failed",
      });
    });

    it("returns the view directly for a completed location", () => {
      const completedView = createCompletedView();
      const callbacks = createCallbacks();

      const view = toIssueView({ kind: "completed", view: completedView }, callbacks);

      expect(view).toBe(completedView);
    });

    it("returns the view directly for a detail location", () => {
      const detailView = createDetailView();
      const callbacks = createCallbacks();

      const view = toIssueView({ kind: "detail", view: detailView }, callbacks);

      expect(view).toBe(detailView);
    });

    it("passes the correct identifier to resolveModelSelection for running entries", () => {
      const runningEntry = createRunningEntry({ issue: createIssue({ identifier: "MT-99" }) });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());
      const callbacks = createCallbacks({ resolveModelSelection });

      toIssueView({ kind: "running", entry: runningEntry }, callbacks);

      expect(resolveModelSelection).toHaveBeenCalledWith("MT-99");
    });

    it("passes the correct identifier to resolveModelSelection for retry entries", () => {
      const retryEntry = createRetryEntry({ identifier: "MT-77" });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());
      const callbacks = createCallbacks({ resolveModelSelection });

      toIssueView({ kind: "retry", entry: retryEntry }, callbacks);

      expect(resolveModelSelection).toHaveBeenCalledWith("MT-77");
    });
  });
});
