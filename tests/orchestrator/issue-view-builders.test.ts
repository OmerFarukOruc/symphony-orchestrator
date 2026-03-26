import { describe, expect, it, vi } from "vitest";

import { buildRunningIssueView, buildRetryIssueView } from "../../src/orchestrator/issue-view-builders.js";
import { createIssue, createModelSelection, createRunningEntry, createRetryEntry } from "./issue-test-factories.js";

describe("issue-view-builders", () => {
  describe("buildRunningIssueView", () => {
    it("converts a running entry to a RuntimeIssueView with correct fields", () => {
      const entry = createRunningEntry();
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view).toMatchObject({
        issueId: "issue-1",
        identifier: "MT-42",
        title: "Test Issue",
        state: "In Progress",
        status: "running",
        attempt: 1,
        workspaceKey: "MT-42",
        workspacePath: "/tmp/symphony/MT-42",
        model: "gpt-5.4",
        reasoningEffort: "high",
        modelSource: "default",
        priority: 1,
        labels: [],
      });
    });

    it("sets modelChangePending to false when configured matches active", () => {
      const entry = createRunningEntry();
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.modelChangePending).toBe(false);
    });

    it("sets modelChangePending to true when configured model differs from active", () => {
      const entry = createRunningEntry({
        modelSelection: createModelSelection({ model: "gpt-5.4", reasoningEffort: "high" }),
      });
      const resolveModelSelection = vi
        .fn()
        .mockReturnValue(createModelSelection({ model: "gpt-5", reasoningEffort: "high" }));

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.modelChangePending).toBe(true);
      expect(view.configuredModel).toBe("gpt-5");
      expect(view.model).toBe("gpt-5.4");
    });

    it("sets modelChangePending to true when configured reasoningEffort differs", () => {
      const entry = createRunningEntry({
        modelSelection: createModelSelection({ reasoningEffort: "high" }),
      });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection({ reasoningEffort: "medium" }));

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.modelChangePending).toBe(true);
      expect(view.configuredReasoningEffort).toBe("medium");
      expect(view.reasoningEffort).toBe("high");
    });

    it("populates configured model fields from resolveModelSelection", () => {
      const entry = createRunningEntry();
      const resolveModelSelection = vi
        .fn()
        .mockReturnValue(createModelSelection({ model: "gpt-5", reasoningEffort: "low", source: "override" }));

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.configuredModel).toBe("gpt-5");
      expect(view.configuredReasoningEffort).toBe("low");
      expect(view.configuredModelSource).toBe("override");
    });

    it("includes startedAt and lastEventAt as ISO strings", () => {
      const startedAtMs = Date.parse("2026-03-15T10:00:00Z");
      const lastEventAtMs = Date.parse("2026-03-15T10:05:00Z");
      const entry = createRunningEntry({ startedAtMs, lastEventAtMs });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.startedAt).toBe("2026-03-15T10:00:00.000Z");
      expect(view.lastEventAt).toBe("2026-03-15T10:05:00.000Z");
    });

    it("includes tokenUsage when present", () => {
      const tokenUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
      const entry = createRunningEntry({ tokenUsage });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.tokenUsage).toEqual(tokenUsage);
    });

    it("passes null tokenUsage when not present", () => {
      const entry = createRunningEntry({ tokenUsage: null });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.tokenUsage).toBeNull();
    });

    it("sets message to 'stopping in <path>' when status is stopping", () => {
      const entry = createRunningEntry({ status: "stopping" });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.status).toBe("stopping");
      expect(view.message).toBe("stopping in /tmp/symphony/MT-42");
    });

    it("sets message to 'running in <path>' when status is running", () => {
      const entry = createRunningEntry({ status: "running" });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRunningIssueView(entry, resolveModelSelection);

      expect(view.message).toBe("running in /tmp/symphony/MT-42");
    });

    it("calls resolveModelSelection with the entry identifier", () => {
      const entry = createRunningEntry({ issue: createIssue({ identifier: "MT-99" }) });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      buildRunningIssueView(entry, resolveModelSelection);

      expect(resolveModelSelection).toHaveBeenCalledWith("MT-99");
    });
  });

  describe("buildRetryIssueView", () => {
    it("converts a retry entry to a RuntimeIssueView with correct fields", () => {
      const entry = createRetryEntry();
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRetryIssueView(entry, resolveModelSelection);

      expect(view).toMatchObject({
        issueId: "issue-1",
        identifier: "MT-43",
        status: "retrying",
        attempt: 2,
        error: "turn_failed",
        workspaceKey: "MT-43",
        model: "gpt-5.4",
        reasoningEffort: "high",
        modelSource: "default",
      });
    });

    it("always sets modelChangePending to false", () => {
      const entry = createRetryEntry();
      const resolveModelSelection = vi
        .fn()
        .mockReturnValue(createModelSelection({ model: "gpt-5", reasoningEffort: "low", source: "override" }));

      const view = buildRetryIssueView(entry, resolveModelSelection);

      expect(view.modelChangePending).toBe(false);
    });

    it("sets message with retry due timestamp", () => {
      const dueAtMs = Date.parse("2026-03-15T12:00:00Z");
      const entry = createRetryEntry({ dueAtMs });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRetryIssueView(entry, resolveModelSelection);

      expect(view.message).toBe("retry due at 2026-03-15T12:00:00.000Z");
    });

    it("sets nextRetryDueAt to the ISO string of dueAtMs", () => {
      const dueAtMs = Date.parse("2026-03-15T12:00:00Z");
      const entry = createRetryEntry({ dueAtMs });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRetryIssueView(entry, resolveModelSelection);

      expect(view.nextRetryDueAt).toBe("2026-03-15T12:00:00.000Z");
    });

    it("uses configured model fields from resolveModelSelection for both model and configured fields", () => {
      const entry = createRetryEntry();
      const configured = createModelSelection({ model: "gpt-5", reasoningEffort: "low", source: "override" });
      const resolveModelSelection = vi.fn().mockReturnValue(configured);

      const view = buildRetryIssueView(entry, resolveModelSelection);

      expect(view.configuredModel).toBe("gpt-5");
      expect(view.configuredReasoningEffort).toBe("low");
      expect(view.configuredModelSource).toBe("override");
      expect(view.model).toBe("gpt-5");
      expect(view.reasoningEffort).toBe("low");
      expect(view.modelSource).toBe("override");
    });

    it("calls resolveModelSelection with the entry identifier", () => {
      const entry = createRetryEntry({ identifier: "MT-77" });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      buildRetryIssueView(entry, resolveModelSelection);

      expect(resolveModelSelection).toHaveBeenCalledWith("MT-77");
    });

    it("includes error from retry entry", () => {
      const entry = createRetryEntry({ error: "startup_failed" });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRetryIssueView(entry, resolveModelSelection);

      expect(view.error).toBe("startup_failed");
    });

    it("handles null error in retry entry", () => {
      const entry = createRetryEntry({ error: null });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRetryIssueView(entry, resolveModelSelection);

      expect(view.error).toBeNull();
    });

    it("handles null workspaceKey in retry entry", () => {
      const entry = createRetryEntry({ workspaceKey: null });
      const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection());

      const view = buildRetryIssueView(entry, resolveModelSelection);

      expect(view.workspaceKey).toBeNull();
    });
  });
});
