import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLogsTimeline } from "../../frontend/src/features/logs/logs-timeline";
import type { AgentEventPayload } from "../../frontend/src/state/runtime-client";
import type { LogsData } from "../../frontend/src/pages/logs-data";
import type { RecentEvent } from "../../frontend/src/types";

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createRecentEvent(overrides: Partial<RecentEvent> = {}): RecentEvent {
  return {
    at: "2026-04-14T20:00:00.000Z",
    issue_id: "issue-1",
    issue_identifier: "NIN-1",
    session_id: "session-1",
    event: "agent_message",
    message: "Agent posted final answer",
    content: "Final answer",
    ...overrides,
  };
}

function createLogsData(overrides: Partial<LogsData> = {}): LogsData {
  return {
    title: "NIN-1 Improve logs",
    issueId: "NIN-1",
    events: [createRecentEvent()],
    ...overrides,
  };
}

function createPayload(overrides: Partial<AgentEventPayload> = {}): AgentEventPayload {
  return {
    issueId: "issue-1",
    identifier: "NIN-1",
    type: "tool_exec",
    message: "Ran command",
    sessionId: "session-1",
    timestamp: "2026-04-14T20:01:00.000Z",
    content: "pnpm test",
    ...overrides,
  };
}

describe("logs-timeline", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the live timeline and drives filter/search state through one boundary", async () => {
    const loadLiveLogs = vi.fn(async () =>
      createLogsData({
        events: [
          createRecentEvent({ event: "agent_message", message: "Agent posted final answer" }),
          createRecentEvent({
            at: "2026-04-14T20:00:02.000Z",
            event: "tool_exec",
            message: "Ran tests",
            content: "pnpm test",
          }),
        ],
      }),
    );

    const timeline = createLogsTimeline({
      id: "NIN-1",
      rerender: vi.fn(),
      deps: {
        loadLiveLogs,
        loadArchiveLogs: vi.fn(async () => createLogsData()),
        runtimeClient: {
          subscribeAllEvents: vi.fn(() => () => undefined),
          subscribeIssueLifecycle: vi.fn(() => () => undefined),
        },
        setInterval: vi.fn(() => 1),
        clearInterval: vi.fn(),
      },
    });

    timeline.initialize();
    await flushMicrotasks();

    expect(loadLiveLogs).toHaveBeenCalledWith("NIN-1");
    expect(timeline.state.issueTitle).toBe("NIN-1 Improve logs");
    expect(timeline.getVisibleEvents()).toHaveLength(2);

    timeline.toggleKind("tool_exec");
    expect(timeline.getVisibleEvents()).toEqual([expect.objectContaining({ event: "tool_exec" })]);

    timeline.setSearchText("pnpm");
    expect(timeline.getVisibleEvents()).toEqual([expect.objectContaining({ message: "Ran tests" })]);
    expect(timeline.getHeaderSummary()).toContain('Search: "pnpm"');
  });

  it("merges live stream events and tracks unseen-event count behind the timeline boundary", async () => {
    let streamHandler: ((event: { type: string; payload: Record<string, unknown> }) => void) | null = null;
    const rerender = vi.fn();

    const timeline = createLogsTimeline({
      id: "NIN-1",
      rerender,
      deps: {
        loadLiveLogs: vi.fn(async () => createLogsData()),
        loadArchiveLogs: vi.fn(async () => createLogsData()),
        runtimeClient: {
          subscribeAllEvents: vi.fn((_identifier, handler) => {
            streamHandler = handler;
            return () => undefined;
          }),
          subscribeIssueLifecycle: vi.fn(() => () => undefined),
        },
        setInterval: vi.fn(() => 1),
        clearInterval: vi.fn(),
      },
    });

    timeline.initialize();
    await flushMicrotasks();

    streamHandler?.({ type: "agent.event", payload: createPayload() as unknown as Record<string, unknown> });

    expect(timeline.getVisibleEvents()).toHaveLength(2);
    expect(timeline.state.newEventCount).toBe(1);
    expect(timeline.getIndicatorLabel()).toBe("↑ 1 new");
    expect(rerender).toHaveBeenLastCalledWith({
      appendEvent: expect.objectContaining({
        index: 0,
        event: expect.objectContaining({
          message: "Ran command",
          event: "tool_exec",
        }),
      }),
    });

    timeline.acknowledgeNewEvents();
    expect(timeline.state.newEventCount).toBe(0);
  });

  it("reconciles lifecycle refreshes and tears down live polling when switching to archive", async () => {
    let lifecycleHandler: (() => void) | null = null;
    let liveUnsubscribed = 0;
    let lifecycleUnsubscribed = 0;
    const clearInterval = vi.fn();
    const loadLiveLogs = vi
      .fn<() => Promise<LogsData>>()
      .mockResolvedValueOnce(createLogsData({ events: [createRecentEvent()] }))
      .mockResolvedValueOnce(
        createLogsData({
          events: [
            createRecentEvent(),
            createRecentEvent({
              at: "2026-04-14T20:02:00.000Z",
              event: "tool_exec",
              message: "Applied patch",
              content: "*** Begin Patch",
            }),
          ],
        }),
      );
    const loadArchiveLogs = vi.fn(async () =>
      createLogsData({
        title: "Archived logs",
        events: [createRecentEvent({ event: "turn_diff", message: "Archived diff", content: "diff --git" })],
      }),
    );

    const timeline = createLogsTimeline({
      id: "NIN-1",
      rerender: vi.fn(),
      deps: {
        loadLiveLogs,
        loadArchiveLogs,
        runtimeClient: {
          subscribeAllEvents: vi.fn(() => () => {
            liveUnsubscribed += 1;
          }),
          subscribeIssueLifecycle: vi.fn((_identifier, handler) => {
            lifecycleHandler = handler;
            return () => {
              lifecycleUnsubscribed += 1;
            };
          }),
        },
        setInterval: vi.fn(() => 42),
        clearInterval,
      },
    });

    timeline.initialize();
    await flushMicrotasks();

    lifecycleHandler?.();
    await flushMicrotasks();

    expect(timeline.getAllEvents()).toHaveLength(2);

    timeline.switchMode("archive");
    await flushMicrotasks();

    expect(clearInterval).toHaveBeenCalledWith(42);
    expect(liveUnsubscribed).toBe(1);
    expect(lifecycleUnsubscribed).toBe(1);
    expect(loadArchiveLogs).toHaveBeenCalledWith("NIN-1");
    expect(timeline.state.mode).toBe("archive");
    expect(timeline.state.issueTitle).toBe("Archived logs");
  });
});
