import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../frontend/src/api", () => ({
  api: {
    getIssue: vi.fn(),
    getAttempts: vi.fn(),
    getAttemptDetail: vi.fn(),
  },
}));

import { api } from "../../frontend/src/api";
import { loadArchiveLogs, loadLiveLogs } from "../../frontend/src/pages/logs-data";
import { resolveInitialLogsMode, shouldFallbackToArchive } from "../../frontend/src/pages/logs-route";
import type { AttemptRecord, AttemptSummary, IssueDetail, RecentEvent } from "../../frontend/src/types";

const mockedApi = vi.mocked(api);

function createAttemptSummary(overrides: Partial<AttemptSummary> = {}): AttemptSummary {
  return {
    attemptId: "attempt-1",
    attemptNumber: null,
    startedAt: "2026-03-21T09:45:02.959Z",
    endedAt: "2026-03-21T09:45:31.596Z",
    status: "completed",
    model: "gpt-5.4",
    reasoningEffort: "high",
    tokenUsage: null,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

function createAttemptRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    ...createAttemptSummary(),
    issueIdentifier: "NIN-23",
    title: "test",
    workspacePath: "/tmp/NIN-23",
    workspaceKey: "NIN-23",
    modelSource: "default",
    turnCount: 1,
    threadId: "thread-1",
    turnId: "turn-1",
    events: [],
    ...overrides,
  };
}

function createRecentEvent(overrides: Partial<RecentEvent> = {}): RecentEvent {
  return {
    at: "2026-03-21T09:45:31.596Z",
    issue_id: "issue-23",
    issue_identifier: "NIN-23",
    session_id: "thread-1-turn-1",
    event: "agent_message",
    message: "Agent posted final answer",
    content: "Final answer",
    ...overrides,
  };
}

function createIssueDetail(overrides: Partial<IssueDetail> = {}): IssueDetail {
  return {
    issueId: "issue-23",
    identifier: "NIN-23",
    title: "test",
    state: "In Progress",
    workspaceKey: "/tmp/NIN-23",
    workspacePath: "/tmp/NIN-23",
    message: null,
    status: "running",
    updatedAt: "2026-03-21T09:45:31.596Z",
    attempt: 1,
    error: null,
    priority: 1,
    labels: [],
    startedAt: "2026-03-21T09:45:02.959Z",
    lastEventAt: "2026-03-21T09:45:31.596Z",
    tokenUsage: null,
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    configuredModel: "gpt-5.4",
    configuredReasoningEffort: "high",
    configuredModelSource: "default",
    modelChangePending: false,
    recentEvents: [createRecentEvent()],
    attempts: [],
    currentAttemptId: "attempt-1",
    ...overrides,
  };
}

describe("logs data helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses the backend attempt order for archived logs when attempt numbers are null", async () => {
    mockedApi.getAttempts.mockResolvedValue({
      attempts: [
        createAttemptSummary({ attemptId: "attempt-new", attemptNumber: null }),
        createAttemptSummary({ attemptId: "attempt-old", attemptNumber: 99 }),
      ],
      current_attempt_id: null,
    });
    mockedApi.getAttemptDetail.mockImplementation(async (attemptId: string) =>
      createAttemptRecord({ attemptId, title: `detail for ${attemptId}` }),
    );

    const result = await loadArchiveLogs("NIN-23");

    expect(mockedApi.getAttemptDetail).toHaveBeenCalledWith("attempt-new");
    expect(result).toMatchObject({
      issueId: "NIN-23",
      title: "detail for attempt-new",
    });
  });

  it("filters streaming placeholder events from live logs", async () => {
    mockedApi.getIssue.mockResolvedValue(
      createIssueDetail({
        recentEvents: [
          createRecentEvent({ event: "agent_streaming", message: "Agent streaming text", content: null }),
          createRecentEvent({ at: "2026-03-21T09:46:00.000Z", message: "Agent posted final answer" }),
        ],
      }),
    );

    const result = await loadLiveLogs("NIN-23");

    expect(result.events).toEqual([expect.objectContaining({ message: "Agent posted final answer" })]);
  });

  it("filters streaming placeholder events from archived logs", async () => {
    mockedApi.getAttempts.mockResolvedValue({
      attempts: [createAttemptSummary({ attemptId: "attempt-new", attemptNumber: null })],
      current_attempt_id: null,
    });
    mockedApi.getAttemptDetail.mockResolvedValue(
      createAttemptRecord({
        attemptId: "attempt-new",
        events: [
          createRecentEvent({ event: "agent_streaming", message: "Agent streaming text", content: null }),
          createRecentEvent({ at: "2026-03-21T09:46:00.000Z", message: "Turn diff updated", event: "turn_diff" }),
        ],
      }),
    );

    const result = await loadArchiveLogs("NIN-23");

    expect(result.events).toEqual([expect.objectContaining({ message: "Turn diff updated", event: "turn_diff" })]);
  });

  it("defaults issue-scoped logs routes to archive mode", () => {
    expect(resolveInitialLogsMode("/issues/NIN-23/logs")).toBe("archive");
    expect(resolveInitialLogsMode("/logs/NIN-23")).toBe("live");
  });

  it("only falls back to archive for missing live issue detail", () => {
    expect(shouldFallbackToArchive(new Error("Unknown issue identifier"))).toBe(true);
    expect(shouldFallbackToArchive(new Error("boom"))).toBe(false);
    expect(shouldFallbackToArchive("Unknown issue identifier")).toBe(false);
  });
});
