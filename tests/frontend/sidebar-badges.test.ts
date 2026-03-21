import { describe, expect, it } from "vitest";

import type { RuntimeSnapshot } from "../../frontend/src/types";
import { buildSidebarBadgeCounts } from "../../frontend/src/ui/sidebar-badges";

function createSnapshot(): RuntimeSnapshot {
  return {
    generated_at: "2026-03-21T00:00:00.000Z",
    counts: { running: 1, retrying: 0 },
    queued: [
      {
        issueId: "1",
        identifier: "SYM-1",
        title: "Pending issue",
        state: "Todo",
        workspaceKey: null,
        workspacePath: null,
        message: null,
        status: "queued",
        updatedAt: "2026-03-21T00:00:00.000Z",
        attempt: null,
        error: null,
        priority: null,
        labels: [],
        startedAt: null,
        lastEventAt: null,
        tokenUsage: null,
        model: null,
        reasoningEffort: null,
        modelSource: null,
        configuredModel: null,
        configuredReasoningEffort: null,
        configuredModelSource: null,
        modelChangePending: false,
        branchName: "feature/sym-1",
      },
    ],
    running: [],
    retrying: [],
    completed: [],
    workflow_columns: [
      { key: "todo", label: "Todo", kind: "todo", terminal: false, count: 3, issues: [] },
      { key: "done", label: "Done", kind: "terminal", terminal: true, count: 2, issues: [] },
    ],
    codex_totals: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      seconds_running: 0,
    },
    rate_limits: null,
    recent_events: [
      {
        at: "2026-03-21T00:00:00.000Z",
        issue_id: "1",
        issue_identifier: "SYM-1",
        session_id: null,
        event: "worker_started",
        message: "started",
        content: null,
      },
    ],
  };
}

describe("buildSidebarBadgeCounts", () => {
  it("derives queue, notifications, and git badge counts", () => {
    const counts = buildSidebarBadgeCounts(createSnapshot());

    expect(counts["/queue"]).toBe(3);
    expect(counts["/notifications"]).toBe(1);
    expect(counts["/git"]).toBe(1);
  });
});
