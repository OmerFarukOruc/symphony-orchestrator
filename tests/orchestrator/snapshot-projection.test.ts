import { describe, expect, it, vi } from "vitest";

import {
  projectCompletedViewsForSnapshot,
  projectOutcomeIssueView,
  projectRetryIssueView,
  projectRunningIssueView,
} from "../../src/orchestrator/core/snapshot-projection.js";
import {
  createCompletedView,
  createIssue,
  createModelSelection,
  createRunningEntry,
  createRetryEntry,
  createWorkspace,
} from "./issue-test-factories.js";

describe("snapshot projection helpers", () => {
  it("projects running entries with configured selection metadata", () => {
    const entry = createRunningEntry();
    const resolveModelSelection = vi.fn().mockReturnValue(createModelSelection({ model: "gpt-5", source: "override" }));

    const view = projectRunningIssueView(entry, resolveModelSelection);

    expect(view).toMatchObject({
      identifier: "MT-42",
      status: "running",
      configuredModel: "gpt-5",
      configuredModelSource: "override",
      model: "gpt-5.4",
      modelSource: "default",
    });
  });

  it("projects retry entries using configured selection as the active model", () => {
    const entry = createRetryEntry({ dueAtMs: Date.parse("2026-04-15T12:00:00Z") });
    const resolveModelSelection = vi
      .fn()
      .mockReturnValue(createModelSelection({ model: "gpt-5", reasoningEffort: "medium" }));

    const view = projectRetryIssueView(entry, resolveModelSelection);

    expect(view).toMatchObject({
      identifier: "MT-43",
      status: "retrying",
      model: "gpt-5",
      reasoningEffort: "medium",
      nextRetryDueAt: "2026-04-15T12:00:00.000Z",
    });
  });

  it("projects outcome views from runtime entry and configured selection", () => {
    const entry = createRunningEntry({
      startedAtMs: Date.parse("2026-04-15T09:00:00Z"),
      lastEventAtMs: Date.parse("2026-04-15T09:30:00Z"),
      modelSelection: createModelSelection({ model: "o3-mini", reasoningEffort: "low", source: "override" }),
    });

    const view = projectOutcomeIssueView(
      createIssue({ identifier: "MT-99" }),
      createWorkspace({ workspaceKey: "ws-99", path: "/tmp/ws/MT-99" }),
      entry,
      createModelSelection(),
      {
        status: "completed",
        attempt: 2,
        pullRequestUrl: "https://github.com/org/repo/pull/99",
      },
    );

    expect(view).toMatchObject({
      identifier: "MT-99",
      workspaceKey: "ws-99",
      status: "completed",
      attempt: 2,
      startedAt: "2026-04-15T09:00:00.000Z",
      updatedAt: "2026-04-15T09:30:00.000Z",
      model: "o3-mini",
      modelSource: "override",
      configuredModel: "gpt-5.4",
      pullRequestUrl: "https://github.com/org/repo/pull/99",
    });
  });

  it("sorts completed views by most recent update and applies the limit", () => {
    const projected = projectCompletedViewsForSnapshot(
      [
        createCompletedView({ identifier: "MT-1", updatedAt: "2026-04-15T09:00:00Z" }),
        createCompletedView({ identifier: "MT-2", updatedAt: "2026-04-15T11:00:00Z" }),
        createCompletedView({ identifier: "MT-3", updatedAt: "2026-04-15T10:00:00Z" }),
      ],
      2,
    );

    expect(projected.map((view) => view.identifier)).toEqual(["MT-2", "MT-3"]);
  });
});
