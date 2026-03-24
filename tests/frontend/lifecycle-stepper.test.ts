import { describe, expect, it } from "vitest";

import type { RecentEvent, RuntimeIssueView } from "../../frontend/src/types";
import { buildLifecycleSteps, shouldCollapseLifecycle } from "../../frontend/src/utils/lifecycle-stepper";

function createIssue(overrides: Partial<RuntimeIssueView> = {}): RuntimeIssueView {
  return {
    issueId: "issue-1",
    identifier: "NIN-42",
    title: "Ship startup stepper",
    state: "In Progress",
    workspaceKey: "NIN-42",
    workspacePath: "/tmp/NIN-42",
    message: null,
    status: "running",
    updatedAt: "2026-03-24T10:00:00.000Z",
    attempt: 1,
    error: null,
    priority: 1,
    labels: [],
    startedAt: "2026-03-24T09:59:00.000Z",
    lastEventAt: "2026-03-24T10:00:00.000Z",
    tokenUsage: null,
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    configuredModel: "gpt-5.4",
    configuredReasoningEffort: "high",
    configuredModelSource: "default",
    modelChangePending: false,
    ...overrides,
  };
}

function createEvent(event: string, at: string): RecentEvent {
  return {
    at,
    issue_id: "issue-1",
    issue_identifier: "NIN-42",
    session_id: null,
    event,
    message: event,
    content: null,
    metadata: null,
  };
}

describe("lifecycle-stepper", () => {
  it("builds a progressive startup timeline from lifecycle events", () => {
    const steps = buildLifecycleSteps(createIssue({ status: "queued" }), [
      createEvent("issue_queued", "2026-03-24T10:00:00.000Z"),
      createEvent("workspace_ready", "2026-03-24T10:00:06.000Z"),
      createEvent("container_running", "2026-03-24T10:00:16.000Z"),
      createEvent("codex_initializing", "2026-03-24T10:00:22.000Z"),
    ]);

    expect(steps.map((step) => step.status)).toEqual(["complete", "complete", "complete", "current", "pending"]);
    expect(steps[1].elapsedSeconds).toBe(6);
    expect(steps[2].elapsedSeconds).toBe(10);
  });

  it("marks the current startup step as failed when a failure event arrives", () => {
    const steps = buildLifecycleSteps(createIssue({ status: "queued" }), [
      createEvent("issue_queued", "2026-03-24T10:00:00.000Z"),
      createEvent("workspace_failed", "2026-03-24T10:00:04.000Z"),
    ]);

    expect(steps.map((step) => step.status)).toEqual(["complete", "failed", "pending", "pending", "pending"]);
  });

  it("collapses once the agent is actively working", () => {
    const issue = createIssue({ status: "running" });
    const steps = buildLifecycleSteps(issue, [
      createEvent("issue_queued", "2026-03-24T10:00:00.000Z"),
      createEvent("workspace_ready", "2026-03-24T10:00:03.000Z"),
      createEvent("container_running", "2026-03-24T10:00:07.000Z"),
      createEvent("codex_initializing", "2026-03-24T10:00:11.000Z"),
      createEvent("thread_started", "2026-03-24T10:00:15.000Z"),
    ]);

    expect(steps.at(-1)?.status).toBe("current");
    expect(shouldCollapseLifecycle(issue, steps)).toBe(true);
  });

  it("falls back to the running phase when only non-lifecycle events remain", () => {
    const issue = createIssue({
      status: "running",
      updatedAt: "2026-03-24T10:02:00.000Z",
      lastEventAt: "2026-03-24T10:02:00.000Z",
    });
    const steps = buildLifecycleSteps(issue, [
      {
        ...createEvent("tool_exec", "2026-03-24T10:02:00.000Z"),
        message: "Running shell command",
      },
    ]);

    expect(steps.map((step) => step.status)).toEqual(["complete", "complete", "complete", "complete", "current"]);
  });

  it("resets to the latest queued sequence on retry", () => {
    const issue = createIssue({ status: "queued", updatedAt: "2026-03-24T10:03:00.000Z" });
    const steps = buildLifecycleSteps(issue, [
      createEvent("issue_queued", "2026-03-24T10:00:00.000Z"),
      createEvent("workspace_ready", "2026-03-24T10:00:03.000Z"),
      createEvent("thread_started", "2026-03-24T10:00:08.000Z"),
      createEvent("issue_queued", "2026-03-24T10:03:00.000Z"),
    ]);

    expect(steps.map((step) => step.status)).toEqual(["current", "pending", "pending", "pending", "pending"]);
    expect(steps[0].at).toBe("2026-03-24T10:03:00.000Z");
  });
});
